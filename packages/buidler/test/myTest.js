const { ethers } = require("@nomiclabs/buidler");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("EPNS Governance", function () {
  let epnsToken;
  let governorAlpha;
  let EPNSCore;

  describe("EPNS", function () {
    it("Should deploy EPNS Token", async function () {
      const EPNS = await ethers.getContractFactory("EPNS");

      epnsToken = await EPNS.deploy();
    });

    describe("get Balance of account 0", function () {
      it("Total Supply should be sent to the msg sender", async function () {
        const [adminSigner] = await ethers.getSigners();
        const account = await adminSigner.getAddress();
        const balance = await epnsToken.balanceOf(account);
        expect(await epnsToken.totalSupply()).to.equal(balance);
      });
    });
  });

  describe("EPNSCore", function() {
      it("Should deploy EPNS Token", async function () {
          const EPNSCore = await ethers.getContractFactory("EPNSCore");

          EPNSCore = await EPNSCore.deploy();
      });
  });
  describe("GovernorAlpha", function() {
      it("Should deploy GovernorAlpha Platform", async function () {
          const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");

          EPNSCore = await GovernorAlpha.deploy();
      });
  });
});
