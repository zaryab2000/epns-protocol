pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./EPNSCoreV1.sol";
import "hardhat/console.sol";
import "./VerzionedInitializable.sol";

contract EPNSCoreV2 is EPNSCoreV1, VersionedInitializable  {
    function initializeUpgrade() virtual external initializerV {
        console.logAddress(daiAddress);
    }

    function getRevision() internal virtual override pure returns (uint) {
        return 2;
    }
}