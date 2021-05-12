const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const {
  advanceBlockTo,
  latestBlock,
  advanceBlock,
  increase,
  increaseTo,
  latest,
} = require("../time");
const { calcChannelFairShare, calcSubscriberFairShare, getPubKey, bn, tokens, tokensBN, bnToInt, } = require("../../helpers/utils");

use(solidity);

describe("EPNSCoreV1 tests", function () {
  const AAVE_LENDING_POOL = "0x1c8756FD2B28e9426CDBDcC7E3c4d64fa9A54728";
  const DAI = "0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108";
  const ADAI = "0xcB1Fe6F440c49E9290c3eb7f158534c2dC374201";
  const referralCode = 0;
  const ADD_CHANNEL_MIN_POOL_CONTRIBUTION = tokensBN(50)
  const ADD_CHANNEL_MAX_POOL_CONTRIBUTION = tokensBN(250000 * 50)
  const DELEGATED_CONTRACT_FEES = ethers.utils.parseEther("0.1");
  const ADJUST_FOR_FLOAT = bn(10 ** 7)
  const delay = 0; // uint for the timelock delay

  const forkAddress = {
    address: "0xe2a6cf5f463df94147a0f0a302c879eb349cb2cd",
  };

  let EPNS;
  let GOVERNOR;
  let PROXYADMIN;
  let LOGIC;
  let LOGICV2;
  let LOGICV3;
  let EPNSProxy;
  let EPNSCoreV1Proxy;
  let TIMELOCK;
  let ADMIN;
  let MOCKDAI;
  let ADAICONTRACT;
  let ALICE;
  let BOB;
  let CHARLIE;
  let CHANNEL_CREATOR;
  let ADMINSIGNER;
  let ALICESIGNER;
  let BOBSIGNER;
  let CHARLIESIGNER;
  let CHANNEL_CREATORSIGNER;
  const ADMIN_OVERRIDE = "";

  const coder = new ethers.utils.AbiCoder();
  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.

  before(async function (){
    const MOCKDAITOKEN = await ethers.getContractFactory("MockDAI");
    MOCKDAI = MOCKDAITOKEN.attach(DAI);

    const ADAITOKENS = await ethers.getContractFactory("MockDAI");
    ADAICONTRACT = ADAITOKENS.attach(ADAI);
  });

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    const [
      adminSigner,
      aliceSigner,
      bobSigner,
      charlieSigner,
      channelCreatorSigner,
    ] = await ethers.getSigners();

    ADMINSIGNER = adminSigner;
    ALICESIGNER = aliceSigner;
    BOBSIGNER = bobSigner;
    CHARLIESIGNER = charlieSigner;
    CHANNEL_CREATORSIGNER = channelCreatorSigner;

    ADMIN = await adminSigner.getAddress();
    ALICE = await aliceSigner.getAddress();
    BOB = await bobSigner.getAddress();
    CHARLIE = await charlieSigner.getAddress();
    CHANNEL_CREATOR = await channelCreatorSigner.getAddress();

    const EPNSTOKEN = await ethers.getContractFactory("EPNS");
    EPNS = await EPNSTOKEN.deploy();

    const EPNSCoreV1 = await ethers.getContractFactory("EPNSCoreV1");
    LOGIC = await EPNSCoreV1.deploy();

    const TimeLock = await ethers.getContractFactory("Timelock");
    TIMELOCK = await TimeLock.deploy(ADMIN, delay);

    const proxyAdmin = await ethers.getContractFactory("EPNSAdmin");
    PROXYADMIN = await proxyAdmin.deploy();
    await PROXYADMIN.transferOwnership(TIMELOCK.address);

    const EPNSPROXYContract = await ethers.getContractFactory("EPNSProxy");
    EPNSProxy = await EPNSPROXYContract.deploy(
      LOGIC.address,
      ADMINSIGNER.address,
      AAVE_LENDING_POOL,
      DAI,
      ADAI,
      referralCode
    );

    await EPNSProxy.changeAdmin(ALICESIGNER .address);
    EPNSCoreV1Proxy = EPNSCoreV1.attach(EPNSProxy.address)
  });

  afterEach(function () {
    EPNS = null
    LOGIC = null
    TIMELOCK = null
    EPNSProxy = null
    EPNSCoreV1Proxy = null
  });

  describe("Testing broadcastUserPublicKey", function(){
    it("Should broadcast user public key", async function(){
      const publicKey = await getPubKey(BOBSIGNER)

      const tx = await EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
      const user = await EPNSCoreV1Proxy.users(BOB)

      expect(user.publicKeyRegistered).to.equal(true);
    });

    it("Should emit PublicKeyRegistered when broadcast user public key", async function(){
      const publicKey = await getPubKey(BOBSIGNER)

      const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));

      await expect(tx)
      .to.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
      .withArgs(BOB, ethers.utils.hexlify(publicKey.slice(1)))
    });

    it("Should not broadcast user public key twice", async function(){
      const publicKey = await getPubKey(BOBSIGNER)
      await EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
      const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
      
      await expect(tx)
      .to.not.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
      .withArgs(BOB, ethers.utils.hexlify(publicKey.slice(1)))
    });

    it("Should revert if broadcast user public does not match with sender address", async function(){
      const publicKey = await getPubKey(ALICESIGNER)
      const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
      
      await expect(tx).to.be.revertedWith("Public Key Validation Failed")
    });

    it("Should update relevant details after broadcast public key", async function(){
      const publicKey = await getPubKey(BOBSIGNER)

      const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
      const tx = await EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
      
      const user = await EPNSCoreV1Proxy.users(BOB);
      const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

      expect(user.userStartBlock).to.equal(tx.blockNumber);
      expect(user.userActivated).to.equal(true);

      expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
    });
  });

  describe("Testing channels related functions", function(){
    describe("Testing createChannelWithFeesAndPublicKey", function(){
      // --------------------- Modifier based tests start ---------------------
      it("should revert on channel creation when User already a channel owner", async function () {
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        const CHANNEL_TYPE_SECOND = 3;
        
        const testChannelSecond = ethers.utils.toUtf8Bytes("test-channel-hello-world-two");

        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE_SECOND, testChannelSecond, publicKey.slice(1));
  
        await expect(tx).to.be.revertedWith("User already a Channel Owner")
      });

      it("should revert on channel creation when user not allowed channel type", async function () {
        const CHANNEL_TYPE = 0;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx1 = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx1).to.be.revertedWith("Channel Type Invalid")

        const CHANNEL_TYPE_SECOND = 1;
        
        const testChannelSecond = ethers.utils.toUtf8Bytes("test-channel-hello-world-two");

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const tx2 = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE_SECOND, testChannelSecond, publicKey.slice(1));
  
        await expect(tx2).to.be.revertedWith("Channel Type Invalid")
      });

      it("should revert on channel creation when User not in Channelization Whitelist", async function () {
        const CHANNEL_TYPE = 2;
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1));
  
        await expect(tx).to.be.revertedWith("User not in Channelization Whitelist")
      });

      // --------------------- Modifier based tests end ---------------------

      it("Should broadcast user public key when creating channel", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
        const user = await EPNSCoreV1Proxy.users(CHANNEL_CREATOR)

        expect(user.publicKeyRegistered).to.equal(true);
      });

      it("should emit PublicKeyRegistered event when user public key is not registered", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
          .withArgs(CHANNEL_CREATOR, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should not broadcast user public key twice", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).broadcastUserPublicKey(publicKey.slice(1));

        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx)
        .to.not.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
        .withArgs(CHANNEL_CREATOR, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should revert if broadcast user public does not match with sender address", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        
        const publicKey = await getPubKey(BOBSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx).to.be.revertedWith("Public Key Validation Failed")
      });

      it("Should update relevant details after broadcast public key", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)

        const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
        
        const user = await EPNSCoreV1Proxy.users(CHANNEL_CREATOR);
        const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

        expect(user.userStartBlock).to.equal(tx.blockNumber);
        expect(user.userActivated).to.equal(true);

        expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
      });

      it("should create a channel when added to whitelist", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});

        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR)
        expect(channel[3].toNumber()).to.equal(1);
      });

      it("should create a channel and set correct values", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
        const channelsCountBefore = await EPNSCoreV1Proxy.channelsCount();

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
        const user = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).users(CHANNEL_CREATOR)
        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR)

        const blockNumber = tx.blockNumber;
        const channelWeight = ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(ADJUST_FOR_FLOAT).div(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        const channelsCountAfter = await EPNSCoreV1Proxy.channelsCount();

        expect(user.channellized).to.equal(true);
        expect(channel.poolContribution).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(channel.channelType).to.equal(CHANNEL_TYPE);
        expect(channel.channelStartBlock).to.equal(blockNumber);
        expect(channel.channelUpdateBlock).to.equal(blockNumber);
        expect(channel.channelWeight).to.equal(channelWeight);
        expect(await EPNSCoreV1Proxy.mapAddressChannels(channelsCountAfter.sub(1))).to.equal(CHANNEL_CREATOR);
        expect(channelsCountBefore.add(1)).to.equal(channelsCountAfter);
        expect(channel.memberCount.toNumber()).to.equal(1);
        expect(channel.deactivated).to.equal(false);
      });

      it("should emit AddChannel event when creating channel", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'AddChannel')
          .withArgs(CHANNEL_CREATOR, CHANNEL_TYPE, ethers.utils.hexlify(testChannel));
      });
  
      it("should revert if allowance is not greater than min fees", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, tokensBN(10));
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        await expect(tx).to.be.revertedWith("Insufficient Funds or max ceiling reached")
      });

      it("should revert if allowance is greater than max fees", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MAX_POOL_CONTRIBUTION.add(ADD_CHANNEL_MAX_POOL_CONTRIBUTION));
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MAX_POOL_CONTRIBUTION.add(ADD_CHANNEL_MAX_POOL_CONTRIBUTION));
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        await expect(tx).to.be.revertedWith("Insufficient Funds or max ceiling reached")
      });
  
      it("should transfer given fees from creator account to proxy", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        const daiBalanceBefore = await MOCKDAI.connect(CHANNEL_CREATORSIGNER).balanceOf(CHANNEL_CREATOR);
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        const daiBalanceAfter = await MOCKDAI.connect(CHANNEL_CREATORSIGNER).balanceOf(CHANNEL_CREATOR);
        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      })
  
      it("should deposit funds to pool and receive aDAI", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        
        const poolFundsBefore = await EPNSCoreV1Proxy.poolFunds()
        const aDAIBalanceBefore = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        const poolFundsAfter = await EPNSCoreV1Proxy.poolFunds();
        const aDAIBalanceAfter = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);

        expect(poolFundsAfter.sub(poolFundsBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(aDAIBalanceAfter.sub(aDAIBalanceBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      });

      // Still to debug
      // it("should subscribe creator to EPNS channel if new user", async function(){
      //   const CHANNEL_TYPE = 2;
        
      //   await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      //   const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
      //   await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      //   await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
      //   const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
      //   await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, ADMIN);
      //   console.log(userSubscribed)

      //   const userSubscribed1 = await EPNSCoreV1Proxy.memberExists(ADMIN, CHANNEL_CREATOR);
      //   console.log(userSubscribed1)

      //   expect(userSubscribed).to.equal(true);
      // });
  
      it("should subscribe them to EPNS Alerter as well", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, "0x0000000000000000000000000000000000000000");
        expect(userSubscribed).to.equal(true);
      });
  
      it("should subscribe creator to own channel", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFeesAndPublicKey(CHANNEL_TYPE, testChannel, publicKey.slice(1), {gasLimit: 2000000});
  
        const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, CHANNEL_CREATOR);
        expect(userSubscribed).to.equal(true);
      });
    });

    describe("Testing createChannelWithFees", function(){

      // --------------------- Modifier based tests start ---------------------
      it("should revert on channel creation when User already a channel owner", async function () {
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        const CHANNEL_TYPE_SECOND = 3;
        
        const testChannelSecond = ethers.utils.toUtf8Bytes("test-channel-hello-world-two");

        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE_SECOND, testChannelSecond);

        await expect(tx).to.be.revertedWith("User already a Channel Owner")
      });

      it("should revert on channel creation when user not allowed channel type", async function () {
        const CHANNEL_TYPE = 0;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const tx1 = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel);

        await expect(tx1).to.be.revertedWith("Channel Type Invalid")

        const CHANNEL_TYPE_SECOND = 1;
        
        const testChannelSecond = ethers.utils.toUtf8Bytes("test-channel-hello-world-two");

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const tx2 = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE_SECOND, testChannelSecond);

        await expect(tx2).to.be.revertedWith("Channel Type Invalid")
      });

      it("should revert on channel creation when User not in Channelization Whitelist", async function () {
        const CHANNEL_TYPE = 2;
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      

        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel);

        await expect(tx).to.be.revertedWith("User not in Channelization Whitelist")
      });
      // --------------------- Modifier based tests end ---------------------

      it("should create a channel when added to whitelist", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
        
        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR)
        expect(channel[3].toNumber()).to.equal(1);
      });

      it("should create a channel and set correct values", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
        const channelsCountBefore = await EPNSCoreV1Proxy.channelsCount();

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
        const user = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).users(CHANNEL_CREATOR)
        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR)

        const blockNumber = tx.blockNumber;
        const channelWeight = ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(ADJUST_FOR_FLOAT).div(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        const channelsCountAfter = await EPNSCoreV1Proxy.channelsCount();

        expect(user.channellized).to.equal(true);
        expect(channel.poolContribution).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(channel.channelType).to.equal(CHANNEL_TYPE);
        expect(channel.channelStartBlock).to.equal(blockNumber);
        expect(channel.channelUpdateBlock).to.equal(blockNumber);
        expect(channel.channelWeight).to.equal(channelWeight);
        expect(await EPNSCoreV1Proxy.mapAddressChannels(channelsCountAfter.sub(1))).to.equal(CHANNEL_CREATOR);
        expect(channelsCountBefore.add(1)).to.equal(channelsCountAfter);
        expect(channel.memberCount.toNumber()).to.equal(1);
        expect(channel.deactivated).to.equal(false);
      });
  
      it("should emit AddChannel event when creating channel", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'AddChannel')
          .withArgs(CHANNEL_CREATOR, CHANNEL_TYPE, ethers.utils.hexlify(testChannel))
      });

      it("should revert if allowance is not greater than min fees", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, tokensBN(10));
  
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        await expect(tx).to.be.revertedWith("Insufficient Funds or max ceiling reached")
      });

      it("should revert if allowance is greater than max fees", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MAX_POOL_CONTRIBUTION.add(ADD_CHANNEL_MAX_POOL_CONTRIBUTION));
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MAX_POOL_CONTRIBUTION.add(ADD_CHANNEL_MAX_POOL_CONTRIBUTION));
  
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        await expect(tx).to.be.revertedWith("Insufficient Funds or max ceiling reached")
      });
  
      it("should transfer given fees from creator account to proxy", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const daiBalanceBefore = await MOCKDAI.connect(CHANNEL_CREATORSIGNER).balanceOf(CHANNEL_CREATOR);

        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel);
  
        const daiBalanceAfter = await MOCKDAI.connect(CHANNEL_CREATORSIGNER).balanceOf(CHANNEL_CREATOR);
        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      });
  
      it("should deposit funds to pool and receive aDAI", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        
        const poolFundsBefore = await EPNSCoreV1Proxy.poolFunds()
        const aDAIBalanceBefore = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        const poolFundsAfter = await EPNSCoreV1Proxy.poolFunds();
        const aDAIBalanceAfter = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);

        expect(poolFundsAfter.sub(poolFundsBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(aDAIBalanceAfter.sub(aDAIBalanceBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      });
  
      // Still to debug
      // it("should subscribe creator to EPNS channel if new user", async function(){
      //   const CHANNEL_TYPE = 2;
        
      //   await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      //   const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
      //   await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      //   await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
      //   console.log('CHANNELCRETOR', CHANNEL_CREATOR)
      //   console.log('ADMIN', ADMIN)
      //   await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, ADMIN);
      //   console.log(userSubscribed)

      //   const userSubscribed1 = await EPNSCoreV1Proxy.memberExists(ADMIN, CHANNEL_CREATOR);
      //   console.log(userSubscribed1)

      //   expect(userSubscribed).to.equal(true);
      // });
  
      it("should subscribe them to EPNS Alerter as well", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, "0x0000000000000000000000000000000000000000");
        expect(userSubscribed).to.equal(true);
      });
  
      it("should subscribe creator to own channel", async function(){
        const CHANNEL_TYPE = 2;
        
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
  
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        const userSubscribed = await EPNSCoreV1Proxy.memberExists(CHANNEL_CREATOR, CHANNEL_CREATOR);
        expect(userSubscribed).to.equal(true);
      });

    });

    describe("Testing createPromoterChannel", function(){
      it("should create promoter channel", async function () {
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});

        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(EPNSCoreV1Proxy.address);
        console.log(channel[3].toNumber());
        expect(channel[3].toNumber()).to.equal(1);
      });

      it("should create a promoter channel and set correct values", async function(){
        const CHANNEL_TYPE = 1;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
      
        const channelsCountBefore = await EPNSCoreV1Proxy.channelsCount();

        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const tx = await EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
        const user = await EPNSCoreV1Proxy.users(EPNSCoreV1Proxy.address)
        const channel = await EPNSCoreV1Proxy.channels(EPNSCoreV1Proxy.address)

        const blockNumber = tx.blockNumber;
        const channelWeight = ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(ADJUST_FOR_FLOAT).div(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        const channelsCountAfter = await EPNSCoreV1Proxy.channelsCount();

        expect(user.channellized).to.equal(true);
        expect(channel.poolContribution).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(channel.channelType).to.equal(CHANNEL_TYPE);
        expect(channel.channelStartBlock).to.equal(blockNumber);
        expect(channel.channelUpdateBlock).to.equal(blockNumber);
        expect(channel.channelWeight).to.equal(channelWeight);
        expect(await EPNSCoreV1Proxy.mapAddressChannels(channelsCountAfter.sub(1))).to.equal(EPNSCoreV1Proxy.address);
        expect(channelsCountBefore.add(1)).to.equal(channelsCountAfter);
        expect(channel.memberCount.toNumber()).to.equal(1);
        expect(channel.deactivated).to.equal(false);
      });
  
      it("should revert with error when creating channel twice", async function () {
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
  
        const tx = EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
        await expect(tx).to.be.revertedWith("Contract has Promoter")
      });
  
      it("should revert if the allowance is not greater than minimum contribution", async function () {
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        const tx = EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
        await expect(tx).to.be.revertedWith("Insufficient Funds")
      });

      it("should emit AddChannel if channel is created", async function () {
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
  
        const tx = EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
  
        await expect(tx)
        .to.emit(EPNSCoreV1Proxy, 'AddChannel')
        .withArgs(EPNSCoreV1Proxy.address, 1, ethers.utils.hexlify(ethers.utils.toUtf8Bytes("1+QmRcewnNpdt2DWYuud3LxHTwox2RqQ8uyZWDJ6eY6iHkfn")))
      });

      it("should transfer given fees from creator account to proxy", async function(){
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const daiBalanceBefore = await MOCKDAI.balanceOf(ADMIN);

        await EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
  
        const daiBalanceAfter = await MOCKDAI.balanceOf(ADMIN);
        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      });

      it("should deposit funds to pool and receive aDAI", async function(){
        await MOCKDAI.mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        
        const poolFundsBefore = await EPNSCoreV1Proxy.poolFunds()
        const aDAIBalanceBefore = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);
  
        const tx = EPNSCoreV1Proxy.createPromoterChannel({gasLimit: 2000000});
  
        const poolFundsAfter = await EPNSCoreV1Proxy.poolFunds();
        const aDAIBalanceAfter = await ADAICONTRACT.balanceOf(EPNSCoreV1Proxy.address);

        expect(poolFundsAfter.sub(poolFundsBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        expect(aDAIBalanceAfter.sub(aDAIBalanceBefore)).to.equal(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
      });
    });

    describe("Testing updateChannelMeta", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");

      it("should revert with error if account updating is not channel owner", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).updateChannelMeta(CHANNEL_CREATOR, testChannel, {gasLimit: 2000000});
        await expect(tx).to.be.revertedWith("Channel doesn't Exists");
      });

      it("should revert with error if channel is deactivated", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).updateChannelMeta(CHANNEL_CREATOR, testChannel, {gasLimit: 2000000});
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      it("should revert with error if channels have more than 1 subscribers", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).updateChannelMeta(CHANNEL_CREATOR, testChannel, {gasLimit: 2000000});
        await expect(tx).to.be.revertedWith("Channel has external subscribers");
      });
  
      it("should update channel meta", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
        
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).updateChannelMeta(CHANNEL_CREATOR, testChannel, {gasLimit: 2000000});
        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR);

        expect(channel.channelUpdateBlock.toNumber()).to.equal(tx.blockNumber);
      });
  
      it("should emit UpdateChannel if channel is updated", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).updateChannelMeta(CHANNEL_CREATOR, testChannel, {gasLimit: 2000000});
  
        await expect(tx)
        .to.emit(EPNSCoreV1Proxy, 'UpdateChannel')
        .withArgs(CHANNEL_CREATOR, ethers.utils.hexlify(testChannel))
      });
    });

    describe("Testing deactivateChannel", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");

      it("should revert if channel already deactivated", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();

        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });
  
      it("should deactivate channel", async function () {
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
  
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
  
        const channel = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).channels(CHANNEL_CREATOR);
        expect(channel[1]).to.equal(true);
      });
    });
  });

  describe("Testing subscribe realted functions", function(){
    describe("Testing subscribeDelegated", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
  
      beforeEach(async function(){
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(DELEGATED_CONTRACT_FEES);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, DELEGATED_CONTRACT_FEES);
      })
  
      it("should revert subscribe if channels are deactivated", async function () {
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      it("should revert subscribe if channels are graylisted", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        await EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        await expect(tx).to.be.revertedWith("Channel is graylisted");
      });

      // it("should deduct delegation fees from user wallet", async function () {
      //   const channelCreatorDAIBalanceBefore = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceBefore);
      //   console.log(DELEGATED_CONTRACT_FEES.toString())
      //   const ownerDaiFundsBefore = await EPNSCoreV1Proxy.ownerDaiFunds();

      //   await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(BOB, CHANNEL_CREATOR);
      //   expect(userSubscribed).to.equal(true);

      //   const channelCreatorDAIBalanceAfter = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceAfter)
      //   console.log(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES))
      //   const ownerDaiFundsAfter = await EPNSCoreV1Proxy.ownerDaiFunds();
      //   console.log(ownerDaiFundsBefore)
      //   console.log(ownerDaiFundsAfter)
      //   console.log(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES))
      //   expect(channelCreatorDAIBalanceAfter).to.equal(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES));
      //   expect(ownerDaiFundsAfter).to.equal(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES));
      // });

      it("should revert if already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });

      it("Should add user to epns contract when subscribing if new user", async function(){
        const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        
        const user = await EPNSCoreV1Proxy.users(BOB);
        const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

        expect(user.userStartBlock).to.equal(tx.blockNumber);
        expect(user.userActivated).to.equal(true);

        expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
      });

      it("should subscribe and change revelant details", async function () {
        const userBefore = await EPNSCoreV1Proxy.users(BOB);
        const channelBefore = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);

        const userAfter = await EPNSCoreV1Proxy.users(BOB);
        const channelAfter = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        expect(userAfter.subscribedCount).to.equal(userBefore.subscribedCount.add(1))
        expect(channelAfter.memberCount).to.equal(channelBefore.memberCount.add(1))
      });

      it("should subscribe and emit Subscribe event", async function () {
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Subscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });
    
    describe("Testing subscribeWithPublicKeyDelegated", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
  
      beforeEach(async function(){
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(DELEGATED_CONTRACT_FEES);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, DELEGATED_CONTRACT_FEES);
      })
  
      it("should revert subscribe if channels are deactivated", async function () {
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      it("should revert subscribe if channels are graylisted", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        await EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);
        
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));
        await expect(tx).to.be.revertedWith("Channel is graylisted");
      });

      // it("should deduct delegation fees from user wallet", async function () {
      //   const channelCreatorDAIBalanceBefore = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceBefore);
      //   console.log(DELEGATED_CONTRACT_FEES.toString())
      //   const ownerDaiFundsBefore = await EPNSCoreV1Proxy.ownerDaiFunds();

      //   const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
      //   const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));
        
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(BOB, CHANNEL_CREATOR);
      //   expect(userSubscribed).to.equal(true);

      //   const channelCreatorDAIBalanceAfter = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceAfter)
      //   console.log(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES))
      //   const ownerDaiFundsAfter = await EPNSCoreV1Proxy.ownerDaiFunds();
      //   console.log(ownerDaiFundsBefore)
      //   console.log(ownerDaiFundsAfter)
      //   console.log(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES))
      //   expect(channelCreatorDAIBalanceAfter).to.equal(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES));
      //   expect(ownerDaiFundsAfter).to.equal(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES));
      // });

      it("should revert if already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });

      it("Should add user to epns contract when subscribing if new user", async function(){
        const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
        
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));
        
        const user = await EPNSCoreV1Proxy.users(BOB);
        const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

        expect(user.userStartBlock).to.equal(tx.blockNumber);
        expect(user.userActivated).to.equal(true);

        expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
      });

      it("Should broadcast user public key when subscribing to channel", async function(){
        const CHANNEL_TYPE = 2;
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
        
        const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");        

        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1), {gasLimit: 2000000});
        const user = await EPNSCoreV1Proxy.users(CHANNEL_CREATOR)

        expect(user.publicKeyRegistered).to.equal(true);
      });

      it("should emit PublicKeyRegistered event when user public key is not registered", async function(){
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
          .withArgs(CHANNEL_CREATOR, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should not broadcast user public key twice", async function(){
        const publicKey = await getPubKey(BOBSIGNER)
        await EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx)
          .to.not.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
          .withArgs(CHANNEL_CREATOR, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should revert if broadcast user public does not match with sender address", async function(){
        const publicKey = await getPubKey(BOBSIGNER)
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1), {gasLimit: 2000000});

        await expect(tx).to.be.revertedWith("Public Key Validation Failed")
      });

      it("should subscribe and change revelant details", async function () {
        const userBefore = await EPNSCoreV1Proxy.users(BOB);
        const channelBefore = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));

        const userAfter = await EPNSCoreV1Proxy.users(BOB);
        const channelAfter = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        expect(userAfter.subscribedCount).to.equal(userBefore.subscribedCount.add(1))
        expect(channelAfter.memberCount).to.equal(channelBefore.memberCount.add(1))
      });

      it("should subscribe and emit Subscribe event", async function () {
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeWithPublicKeyDelegated(CHANNEL_CREATOR, BOB, publicKey.slice(1));

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Subscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });

    describe("Testing subscribeWithPublicKey", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
  
      beforeEach(async function(){
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
      })
  
      it("should revert subscribe if channels are deactivated", async function () {
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        const publicKey = await getPubKey(BOBSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      // it("should deduct delegation fees from user wallet", async function () {
      //   const channelCreatorDAIBalanceBefore = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceBefore);
      //   console.log(DELEGATED_CONTRACT_FEES.toString())
      //   const ownerDaiFundsBefore = await EPNSCoreV1Proxy.ownerDaiFunds();

      //   const publicKey = await getPubKey(BOBSIGNER)
        
      //   const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));
        
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(BOB, CHANNEL_CREATOR);
      //   expect(userSubscribed).to.equal(true);

      //   const channelCreatorDAIBalanceAfter = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceAfter)
      //   console.log(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES))
      //   const ownerDaiFundsAfter = await EPNSCoreV1Proxy.ownerDaiFunds();
      //   console.log(ownerDaiFundsBefore)
      //   console.log(ownerDaiFundsAfter)
      //   console.log(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES))
      //   expect(channelCreatorDAIBalanceAfter).to.equal(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES));
      //   expect(ownerDaiFundsAfter).to.equal(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES));
      // });

      it("should revert if already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const publicKey = await getPubKey(BOBSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });

      it("Should add user to epns contract when subscribing if new user", async function(){
        const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
        
        const publicKey = await getPubKey(BOBSIGNER)
        
        const tx = await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));
        
        const user = await EPNSCoreV1Proxy.users(BOB);
        const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

        expect(user.userStartBlock).to.equal(tx.blockNumber);
        expect(user.userActivated).to.equal(true);

        expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
      });

      it("Should broadcast user public key when subscribing to channel", async function(){
        const publicKey = await getPubKey(BOBSIGNER)
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));
        const user = await EPNSCoreV1Proxy.users(BOB)

        expect(user.publicKeyRegistered).to.equal(true);
      });

      it("should emit PublicKeyRegistered event when user public key is not registered", async function(){
        const publicKey = await getPubKey(BOBSIGNER)
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
          .withArgs(BOB, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should not broadcast user public key twice", async function(){
        const publicKey = await getPubKey(BOBSIGNER)
        await EPNSCoreV1Proxy.connect(BOBSIGNER).broadcastUserPublicKey(publicKey.slice(1));
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));

        await expect(tx)
          .to.not.emit(EPNSCoreV1Proxy, 'PublicKeyRegistered')
          .withArgs(BOB, ethers.utils.hexlify(publicKey.slice(1)))
      });

      it("Should revert if broadcast user public does not match with sender address", async function(){
        const publicKey = await getPubKey(CHANNEL_CREATORSIGNER)
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));

        await expect(tx).to.be.revertedWith("Public Key Validation Failed")
      });

      it("should subscribe and change revelant details", async function () {
        const userBefore = await EPNSCoreV1Proxy.users(BOB);
        const channelBefore = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        const publicKey = await getPubKey(BOBSIGNER)
        
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));

        const userAfter = await EPNSCoreV1Proxy.users(BOB);
        const channelAfter = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        expect(userAfter.subscribedCount).to.equal(userBefore.subscribedCount.add(1))
        expect(channelAfter.memberCount).to.equal(channelBefore.memberCount.add(1))
      });

      it("should subscribe and emit Subscribe event", async function () {
        const publicKey = await getPubKey(BOBSIGNER)
        
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribeWithPublicKey(CHANNEL_CREATOR, publicKey.slice(1));

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Subscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });
    
    describe("Testing subscribe", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
  
      beforeEach(async function(){
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
      })
  
      it("should revert subscribe if channels are deactivated", async function () {
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      // it("should deduct delegation fees from user wallet", async function () {
      //   const channelCreatorDAIBalanceBefore = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceBefore);
      //   console.log(DELEGATED_CONTRACT_FEES.toString())
      //   const ownerDaiFundsBefore = await EPNSCoreV1Proxy.ownerDaiFunds();

      //   const publicKey = await getPubKey(BOBSIGNER)
        
      //   const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        
      //   const userSubscribed = await EPNSCoreV1Proxy.memberExists(BOB, CHANNEL_CREATOR);
      //   expect(userSubscribed).to.equal(true);

      //   const channelCreatorDAIBalanceAfter = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
      //   console.log(channelCreatorDAIBalanceAfter)
      //   console.log(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES))
      //   const ownerDaiFundsAfter = await EPNSCoreV1Proxy.ownerDaiFunds();
      //   console.log(ownerDaiFundsBefore)
      //   console.log(ownerDaiFundsAfter)
      //   console.log(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES))
      //   expect(channelCreatorDAIBalanceAfter).to.equal(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES));
      //   expect(ownerDaiFundsAfter).to.equal(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES));
      // });

      it("should revert if already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });

      it("Should add user to epns contract when subscribing if new user", async function(){
        const usersCountBefore = await EPNSCoreV1Proxy.usersCount()
        
        const tx = await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        
        const user = await EPNSCoreV1Proxy.users(BOB);
        const usersCountAfter = await EPNSCoreV1Proxy.usersCount()

        expect(user.userStartBlock).to.equal(tx.blockNumber);
        expect(user.userActivated).to.equal(true);

        expect(usersCountBefore.add(1)).to.equal(usersCountAfter);
      });

      it("should subscribe and change revelant details", async function () {
        const userBefore = await EPNSCoreV1Proxy.users(BOB);
        const channelBefore = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);

        const userAfter = await EPNSCoreV1Proxy.users(BOB);
        const channelAfter = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        expect(userAfter.subscribedCount).to.equal(userBefore.subscribedCount.add(1))
        expect(channelAfter.memberCount).to.equal(channelBefore.memberCount.add(1))
      });

      it("should subscribe and emit Subscribe event", async function () {
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Subscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });

    describe("Testing unsubscribe", function(){
      const CHANNEL_TYPE = 2;
      const testChannel = ethers.utils.toUtf8Bytes("test-channel-hello-world");
  
      beforeEach(async function(){
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).addToChannelizationWhitelist(CHANNEL_CREATOR, {gasLimit: 500000});
      
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).mint(ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await MOCKDAI.connect(CHANNEL_CREATORSIGNER).approve(EPNSCoreV1Proxy.address, ADD_CHANNEL_MIN_POOL_CONTRIBUTION);
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).createChannelWithFees(CHANNEL_TYPE, testChannel, {gasLimit: 2000000});
      })
  
      it("should revert subscribe if channel doesn't exist", async function () {
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(BOB);
        await expect(tx).to.be.revertedWith("Channel doesn't Exists");
      });

      it("should revert subscribe if owner tries to unsubscribe", async function () {
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).unsubscribe(CHANNEL_CREATOR);
        await expect(tx).to.be.revertedWith("Either Channel Owner or Not Subscribed");
      });

      it("should revert subscribe if  not already subscribed", async function () {
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);
        await expect(tx).to.be.revertedWith("Either Channel Owner or Not Subscribed");
      });

      it("should unsubscribe and change revelant details", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const userBefore = await EPNSCoreV1Proxy.users(BOB);
        const channelBefore = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);
        await EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);

        const userAfter = await EPNSCoreV1Proxy.users(BOB);
        const channelAfter = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        expect(userAfter.subscribedCount).to.equal(userBefore.subscribedCount.sub(1))
        expect(channelAfter.memberCount).to.equal(channelBefore.memberCount.sub(1))
      });

      it("should unsubscribe and emit Unsubscribe event", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Unsubscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });
  });
});