pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./EPNSCoreV2.sol";
import "hardhat/console.sol";
import "./VerzionedInitializable.sol";

contract EPNSCoreV3 is EPNSCoreV2 {
    function initializeUpgrade() initializerV external override  {

        console.log(DELEGATED_CONTRACT_FEES);
        DELEGATED_CONTRACT_FEES = 2 * 10 ** 17; // 0.1 DAI to perform any delegate call
        console.logAddress(daiAddress);
        console.log(DELEGATED_CONTRACT_FEES);
    }

    function getRevision() internal virtual override pure returns (uint) {
        return 3;
    }
}