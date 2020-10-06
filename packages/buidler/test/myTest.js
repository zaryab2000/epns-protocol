const { ethers } = require("@nomiclabs/buidler");
const { use, expect } = require("chai");
const { MockProvider, solidity } = require("ethereum-waffle");

use(solidity);

describe("EPNS Governance", function () {
  let EPNS;
  let GOVERNOR;
  let LOGIC;
  let EPNSProxy;
  let GOVERNANCE;

  const AAVE_LENDING_POOL = "0xA1bFBd2062f298a46f3E4160C89BEDa0716a3F51";
  const DAI = "0xA1bFBd2062f298a46f3E4160C89BEDa0716a3F51";
  const ADAI = "0xA1bFBd2062f298a46f3E4160C89BEDa0716a3F51";
  const referralCode = 0;
  const delay = 0; // uint for the timelock delay

  const [admin, alice, bob] = new MockProvider().getWallets();
  describe("EPNS", function () {
    it("Should deploy EPNS Token", async function () {
      const EPNSTOKEN = await ethers.getContractFactory("EPNS");
      EPNS = await EPNSTOKEN.deploy();
    });

    describe("get Balance of account 0", function () {
      it("Total Supply should be sent to the msg sender", async function () {
        const [adminSigner] = await ethers.getSigners();
        const account = await adminSigner.getAddress();
        const balance = await EPNS.balanceOf(account);
        expect(await EPNS.totalSupply()).to.equal(balance);
      });
    });
  });

  describe("EPNSCore Logic", function () {
    it("Should deploy the EPNS Core Logic", async function () {
      const EPNSCore = await ethers.getContractFactory("EPNSCore");

      LOGIC = await EPNSCore.deploy();
    });
  });

  describe("Timelock", function () {
    it("Should deploy A Timelock", async function () {
      const TimeLock = await ethers.getContractFactory("Timelock");

      GOVERNANCE = await TimeLock.deploy(admin, delay);
    });
  });
  describe("GovernorAlpha", function () {
    it("Should deploy GovernorAlpha Platform", async function () {
      const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");

      GOVERNOR = await GovernorAlpha.deploy(
        GOVERNANCE.address,
        EPNS.address,
        admin
      );
    });
  });

  describe("EPNSProxy", function () {
    it("Should deploy EPNS Core Proxy", async function () {
      const EPNSPROXYContract = await ethers.getContractFactory("EPNSProxy");

      EPNSProxy = await EPNSPROXYContract.deploy(
        LOGIC.address,
        GOVERNANCE.address,
        AAVE_LENDING_POOL,
        DAI,
        ADAI,
        referralCode
      );
    });
  });

  describe("EPNSProxy - Upgrade Logic to V2 Contract", function () {
    let proposal;
    it("Admin will delegate all votes to admin", async function () {
      // need to delegate tokens to make proposals
      await EPNS.functions.delegate(admin);
    });

    it("Admin will create a new proposal and vote for it", async function () {
      // proposal steps
      const targets = [];
      const values = [];
      const signatures = [];
      const calldatas = [];
      const description = ""; // ipfs hash

      proposal = await GOVERNOR.functions.propose(
        targets,
        values,
        signatures,
        calldatas,
        description
      );

      await GOVERNOR.functions.castVote(proposal, true); // vote in support of the proposal

      // move time into the future whatever the timeout of the prposal is set to
    });

    it("Admin will queue the finalized proposal", async function () {
      await GOVERNOR.functions.queue(proposal.id);

      // pass time until timelock
    });
    it("Admin execute the proposal.", async function () {
      await GOVERNOR.functions.execute(proposal.id);
    });
  });
});
