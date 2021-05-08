const { ethers } = require("ethers");

const tokenInfo = {
    // token info to test
    name: 'Ethereum Push Notification Service',
    symbol: 'PUSH',
    decimals: 18,
    supply: 100000000, // 100 Million $PUSH
}

const bn = function(number, defaultValue = null) { if (number == null) { if (defaultValue == null) { return null } number = defaultValue } return ethers.BigNumber.from(number) }

const tokens = function (amount) { return (bn(amount).mul(bn(10).pow(tokenInfo.decimals))).toString() }
const tokensBN = function (amount) { return (bn(amount).mul(bn(10).pow(tokenInfo.decimals))) }
const bnToInt = function (bnAmount) { return bnAmount.div(bn(10).pow(tokenInfo.decimals)) }

const calcChannelFairShare = (
    currentBlock,
    channelStartBlock,
    channelWeight,
    groupHistoricalZ,
    groupFairShareCount,
    groupLastUpdate,
    groupNormalizedWeight
) => {
    // formula is ratio = da / z + (nxw)
    // d is the difference of blocks from given block and the last update block of the entire group
    // a is the actual weight of that specific group
    // z is the historical constant
    // n is the number of channels
    // x is the difference of blocks from given block and the last changed start block of group
    // w is the normalized weight of the groups

    const d = currentBlock - channelStartBlock;
    const a = channelWeight;
    const z = groupHistoricalZ;
    const n = groupFairShareCount;
    const x = currentBlock - groupLastUpdate;
    const w = groupNormalizedWeight;

    const NXW = n * x * w;
    const ZNXW = z + NXW;
    const da = d * a;

    // eslint-disable-next-line camelcase
    return (da * ADJUST_FOR_FLOAT) / ZNXW;
};
  
const calcSubscriberFairShare = (
    currentBlock,
    memberLastUpdate,
    channelHistoricalZ,
    channelLastUpdate,
    channelFairShareCount
) => {
    // formula is ratio = d / z + (nx)
    // d is the difference of blocks from given block and the start block of subscriber
    // z is the historical constant
    // n is the number of subscribers of channel
    // x is the difference of blocks from given block and the last changed start block of channel

    const d = currentBlock - memberLastUpdate;
    const z = channelHistoricalZ;
    const x = currentBlock - channelLastUpdate;

    const nx = channelFairShareCount * x;

    return (d * ADJUST_FOR_FLOAT) / (z + nx); // == d / z + n * x
};

const getPubKey = async (
    signer
) => {
    const message = "epns.io"
    const signature = await signer.signMessage(message)
    const msgHash = ethers.utils.hashMessage(message);
    const msgHashBytes = ethers.utils.arrayify(msgHash);
    const recoveredPubKey = ethers.utils.recoverPublicKey(msgHashBytes, signature);

    return ethers.utils.arrayify(recoveredPubKey);
}

module.exports = {
    bn,
    tokens,
    tokensBN,
    bnToInt,
    calcChannelFairShare,
    calcSubscriberFairShare,
    getPubKey
}