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
const { calcChannelFairShare, calcSubscriberFairShare, getPubKey, bn, tokens, tokensBN, bnToInt, ChannelAction, readjustFairShareOfChannels, SubscriberAction, readjustFairShareOfSubscribers } = require("../../helpers/utils");

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

    await EPNSProxy.changeAdmin(ALICESIGNER.address);
    EPNSCoreV1Proxy = EPNSCoreV1.attach(EPNSProxy.address)
  });

  afterEach(function () {
    EPNS = null
    LOGIC = null
    TIMELOCK = null
    EPNSProxy = null
    EPNSCoreV1Proxy = null
  });

  describe("Testing subscribe realted functions", function(){
    
    /**
     * "subscribe" Function CHECKPOINTS
     *  Should only be called for Activated Channels
     * Should revert if an already Subscribed user calls the function
     * Should add the user to the ecosystem if they aren't already added.
     * Should update User's Subscription details in the contract
     * Should update the Channel's Subscription Details in the contract
     * Should update the FAIRSHARE COUNTS
    //  */
    describe("Testing the Base SUBSCRIBE Function", function(){ 
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

      it("User should be able to subscribe ONLY if Channel Is Activated", async ()=>{
          const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(ALICE);
          await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      })

       it("Function should revert if user already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribe(CHANNEL_CREATOR);
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });

      it("Should Add User in the Ecosystem if they aren't added already", async function () {
          const userDetails = await EPNSCoreV1Proxy.users(BOB);
          const userActivatedBefore = userDetails[0];
          const totalUsers_before = await EPNSCoreV1Proxy.usersCount();

          await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
          const userDetails_after = await EPNSCoreV1Proxy.users(BOB);
          const userActivatedAfter= userDetails_after[0];
          const totalUsers_after =  await EPNSCoreV1Proxy.usersCount();
   

          expect(userActivatedBefore).to.be.equals(false);
          expect(userActivatedAfter).to.be.equals(true);
          expect(totalUsers_before).to.equal(3);
          expect(totalUsers_after).to.equal(4);
      });

      it("Should Update the User & Channel Subscription Details on the Contract", async ()=>{
          const userDetails = await EPNSCoreV1Proxy.users(BOB);
          const channelDetails = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);
          
          const userSubscribeCount_before = userDetails[4];
          const channelMemberCount_before = channelDetails[3];

          const tx =  await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);

          const userDetails_after = await EPNSCoreV1Proxy.users(BOB);
          const channelDetails_after = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);
          const channelMemberCount_after = channelDetails_after[3];

          const userSubscribeCount_after = userDetails_after[4];
          const memberExists = await EPNSCoreV1Proxy.memberExists(BOB,CHANNEL_CREATOR);

          expect(memberExists).to.be.equals(true);
          expect(userSubscribeCount_before).to.equal(0);
          expect(userSubscribeCount_after).to.equal(1);
          expect(channelMemberCount_before).to.equal(1);
          expect(channelMemberCount_after).to.equal(2);
          await expect(tx).to.emit(EPNSCoreV1Proxy,'Subscribe')
          .withArgs(CHANNEL_CREATOR,BOB)
      })


      it("Should update the FAIR SHARE RATIO", async ()=>{
  
      })
    });


   /**
     * "unsubscribe" Function CHECKPOINTS
     * Should only be called for Valid Channels -> users[_channel].channellized == true
     * Should Not be executable for the Channel OWNER
     * Should Not be executable for a Non Subscribed User
     * Should mark Channel as GRAY LISTED for User
     * Should Update Relevant Information on Chain for User
     * Should Update Relevant Information on Chain for Channel
     * The Withdrawal of Funds from POOL should execute as expected
     * Should calculate FAIR SHARE RATION as expected
     * Should  execute Subscribe Function and EMit events as expected
     */
    describe("Testing the unsubscribe function", function(){
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

      it("Function should only be accessibly for VALID Channels", async()=>{
        // Check if Channalized is True
        const userDetails = await EPNSCoreV1Proxy.users(BOB);
        const isChannnalized = userDetails[2];
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(BOB);
        
        await expect(isChannnalized).to.be.equals(false)
        await expect(tx).to.be.revertedWith("Channel doesn't Exists");
      })

      it("Channel Owner should NOT be able to unsubscribe their own Channels", async()=>{
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).unsubscribe(CHANNEL_CREATOR);
        await expect(tx).to.be.revertedWith("Either Channel Owner or Not Subscribed");
      })

      it("Function Should Not be executable for a Non Subscribed User", async() =>{
        // CHeck if User actually exists as a Subscriber
        const isMemberExists = await EPNSCoreV1Proxy.memberExists(BOB,CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);

        expect(isMemberExists).to.be.equals(false);
        await expect(tx).to.be.revertedWith("Either Channel Owner or Not Subscribed");
      })

      it("Should mark Channel as GRAY LISTED for User",async()=>{
          await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
         // grayListed Mapping before UnSubscribing
         const isGrayListed_before = await EPNSCoreV1Proxy.getGrayListedChannels(BOB,CHANNEL_CREATOR);
          
        await EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);
          // grayListed Mapping after UnSubscribing
         const isGrayListed_after = await EPNSCoreV1Proxy.getGrayListedChannels(BOB,CHANNEL_CREATOR);


        await expect(isGrayListed_before).to.be.equals(false)
        await expect(isGrayListed_after).to.be.equals(true)
     

      }).timeout(12000);

    });


   /**
     * "subscribeDelegated" Function CHECKPOINTS
     * Should only be called for Activated Channels
     * Should only be called for NonGraylistedChannel Channels
     * Should Charge DELEGATED_CONTRACT_FEES amount from the Channel_Creator
     * Should add the charged DELEGATED_CONTRACT_FEES to the Owner's DAI Funds
     * Should  execute Subscribe Function and EMit events as expected
     */
    describe("Testing the subscribeDelegated function", function(){
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
  
      it("Function should  revert subscribe if channels are deactivated", async function () {
        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).deactivateChannel();
        
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        await expect(tx).to.be.revertedWith("Channel deactivated or doesn't exists");
      });

      // it("should revert subscribe if channels are graylisted", async function () {
      //   await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
      //   await EPNSCoreV1Proxy.connect(BOBSIGNER).unsubscribe(CHANNEL_CREATOR);
        
      //   const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
      //   await expect(tx).to.be.revertedWith("Channel is graylisted");
      // });

      it("Function should deduct delegation fees from user wallet", async function () {
        const channelCreatorDAIBalanceBefore = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
  
        const ownerDaiFundsBefore = await EPNSCoreV1Proxy.ownerDaiFunds();

        await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        
        const userSubscribed = await EPNSCoreV1Proxy.memberExists(BOB, CHANNEL_CREATOR);
        expect(userSubscribed).to.equal(true);

        const channelCreatorDAIBalanceAfter = await MOCKDAI.balanceOf(CHANNEL_CREATOR);
  
  
        const ownerDaiFundsAfter = await EPNSCoreV1Proxy.ownerDaiFunds();
  

        expect(channelCreatorDAIBalanceAfter).to.equal(channelCreatorDAIBalanceBefore.sub(DELEGATED_CONTRACT_FEES));
        expect(ownerDaiFundsAfter).to.equal(ownerDaiFundsBefore.add(DELEGATED_CONTRACT_FEES));
      });

      it("should revert if already subscribed", async function () {
        await EPNSCoreV1Proxy.connect(BOBSIGNER).subscribe(CHANNEL_CREATOR);
        const tx = EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        
        await expect(tx).to.be.revertedWith("Subscriber already Exists");
      });


      it("should subscribe and update fair share values", async function(){
        const channel = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        const _channelFairShareCount = channel.channelFairShareCount;
        const _channelHistoricalZ = channel.channelHistoricalZ;
        const _channelLastUpdate = channel.channelLastUpdate;
        
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);
        const blockNumber = tx.blockNumber;
        
        const { 
          channelNewFairShareCount, 
          channelNewHistoricalZ, 
          channelNewLastUpdate, 
        } = readjustFairShareOfSubscribers(SubscriberAction.SubscriberAdded, _channelFairShareCount, _channelHistoricalZ, _channelLastUpdate, bn(blockNumber));
        
        const channelNew = await EPNSCoreV1Proxy.channels(CHANNEL_CREATOR);

        const _channelNewFairShareCountNew = channelNew.channelFairShareCount;
        const _channelHistoricalZNew = channelNew.channelHistoricalZ;
        const _channelLastUpdateNew = channelNew.channelLastUpdate;
        
        expect(_channelNewFairShareCountNew).to.equal(channelNewFairShareCount);
        expect(_channelHistoricalZNew).to.equal(channelNewHistoricalZ);
        expect(_channelLastUpdateNew).to.equal(channelNewLastUpdate);
      });

      it("should subscribe and emit Subscribe event", async function () {
        const tx = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).subscribeDelegated(CHANNEL_CREATOR, BOB);

        await expect(tx)
          .to.emit(EPNSCoreV1Proxy, 'Subscribe')
          .withArgs(CHANNEL_CREATOR, BOB)
      });
    });

    
   /**
     * "subscribeWithPublicKey & subscribeWithPublicKeyDelegated" Function CHECKPOINTS
     * Should only be called for Activated Channels
     * Should only be called for NonGraylistedChannel Channels
     * Should Charge DELEGATED_CONTRACT_FEES amount from the Channel_Creator
     * Should add the charged DELEGATED_CONTRACT_FEES to the Owner's DAI Funds
     * Should  execute Subscribe Function and EMit events as expected
     */
    describe("Testing the unsubscribe function", function(){
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
    });


  });
});