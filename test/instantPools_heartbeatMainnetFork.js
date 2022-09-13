const Chainlink = artifacts.require("TesterChainlink");
const ChainLinkAggregator = artifacts.require("IChainLink");

const HeartBeatTest = artifacts.require("HeartbeatStandAlone");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

// const NFT1155 = artifacts.require("NFT1155");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow, getTokenData } = require('./utils');

const debugFlag = true;

require("./constants");
require("./utils");

const data = require("./data.js").data;

const debug = (
    message1,
    message2
) => {
    if (debugFlag) {
        console.log(
            `${message1}: ${message2.toString()}`
        );
    }
}

//***********************************************
// For this use npm run mainnetForkOldBlock instead of normal npm run chain!!!
//
//***********************************************


contract("instantPools reclibrate mainnet", async accounts => {

    const [owner, alice, bob, peter] = accounts;

    let heartbeat;
    let aggregatorUSDC;
    let aggregatorUSDT;
    let feedETH;

    describe("MainnetFork heartbeat recalibrate tests", () => {

        beforeEach(async() => {

            heartbeat = await HeartBeatTest.new();

            aggregatorUSDC = await ChainLinkAggregator.at(
                "0x789190466E21a8b78b8027866CBBDc151542A26C"
            );

            aggregatorUSDT = await ChainLinkAggregator.at(
                "0xa964273552C1dBa201f5f000215F5BD5576e8f93"
            );

            feedETH = await ChainLinkAggregator.at(
                "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
            );
        });

        it("Getting a non 0 value for the  reclibrate view", async ()=> {

            const chainLinkUSDETH = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
            const chainlinkUSDT = "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D";
            const chainlinkBTC = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";
            const chainLinkUSDCETH = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4";
            const chainLinkusdUSDC = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

            const newHeartbeatETH = await heartbeat.recalibratePreview(
                chainLinkUSDETH
            );

            assert.isAbove(
                parseInt(newHeartbeatETH),
                parseInt(0)
            );

            const aggroRoundIDETH = await heartbeat.getLatestAggregatorRoundId(
                chainLinkUSDETH
            );

            assert.isAbove(
                parseInt(aggroRoundIDETH),
                parseInt(0)
            );

            const newHeartbeatUSDT = await heartbeat.recalibratePreview(
                chainlinkUSDT
            );

            assert.isAbove(
                parseInt(newHeartbeatUSDT),
                parseInt(0)
            );

            await heartbeat.recalibrate(
                chainlinkUSDT
            );

            const mappingValueUSDT = await heartbeat.chainLinkHeartBeat(
                chainlinkUSDT
            );

            assert.equal(
                newHeartbeatUSDT.toString(),
                mappingValueUSDT.toString()
            );

            const aggregatorRoundIDUSDT = await heartbeat.getLatestAggregatorRoundId(
                chainlinkUSDT
            );

            assert.isAbove(
                parseInt(aggregatorRoundIDUSDT),
                parseInt(0)
            );

            const newHeartbeatUSDC = await heartbeat.recalibratePreview(
                chainLinkusdUSDC
            );

            assert.isAbove(
                parseInt(newHeartbeatUSDC),
                parseInt(0)
            );

            await heartbeat.recalibrate(
                chainLinkusdUSDC
            );

            const mappingValueUSDC = await heartbeat.chainLinkHeartBeat(
                chainLinkusdUSDC
            );

            assert.equal(
                newHeartbeatUSDC.toString(),
                mappingValueUSDC.toString()
            );

            const aggroRoundIDUSDC = await heartbeat.getLatestAggregatorRoundId(
                chainLinkusdUSDC
            );

            assert.isAbove(
                parseInt(aggroRoundIDUSDC),
                parseInt(0)
            );

            const newHeartbeatBTC = await heartbeat.recalibratePreview(
                chainlinkBTC
            );

            assert.isAbove(
                parseInt(newHeartbeatBTC),
                parseInt(0)
            );

            const newHeartBeatchainLinkUSDCETH = await heartbeat.recalibratePreview(
                chainLinkUSDCETH
            );

            assert.isAbove(
                parseInt(newHeartBeatchainLinkUSDCETH),
                parseInt(0)
            );
        });

        it("Less than 50 round aggregator USDC", async ()=> {

            const chainLinkusdUSDC = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

            const previewUSDCValue = await heartbeat.recalibratePreview(
                chainLinkusdUSDC
            );

            const lastestRoundDataResponse = await aggregatorUSDC.latestRoundData();
            const aggregatorRoundID = lastestRoundDataResponse[0];

            assert.isAbove(
                parseInt(aggregatorRoundID),
                parseInt(0)
            );

            const displayLength = new BN(
                aggregatorRoundID
            );

            let roundDataResponse;
            let updatedTime;

            let currentBiggest = new BN(0);
            let currentSecondBiggest = new BN(0);

            let diff;
            let latestStamp = lastestRoundDataResponse[3];
            let currentStamp;

            for (i = 1; i < displayLength; i++) {

                currentStamp = await aggregatorUSDC.getRoundData(displayLength.sub(new BN(i)));
                currentStamp = currentStamp[3];

                diff = latestStamp - currentStamp;

                latestStamp = currentStamp;

                if (diff >= currentBiggest) {
                    currentSecondBiggest = currentBiggest;
                    currentBiggest = diff;
                } else if (diff > currentSecondBiggest && diff < currentBiggest) {
                    currentSecondBiggest = diff;
                }
            }

            assert.equal(
                previewUSDCValue.toString(),
                currentSecondBiggest.toString()
            );
        });

        it("Less than 50 round aggregator USDT", async ()=> {

            const chainlinkUSDT = "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D";

            const previewUSDTValue = await heartbeat.recalibratePreview(
                chainlinkUSDT
            );

            const lastestRoundDataResponse = await aggregatorUSDT.latestRoundData();
            const aggregatorRoundID = lastestRoundDataResponse[0];

            const displayLength = new BN(
                aggregatorRoundID
            );

            let updatedTime;
            let roundDataResponse;

            let currentBiggest = new BN(0);
            let currentSecondBiggest = new BN(0);

            let diff;
            let latestStamp = lastestRoundDataResponse[3];
            let currentStamp;

            for (i = 1; i < displayLength; i++) {

                currentStamp = await aggregatorUSDT.getRoundData(displayLength.sub(new BN(i)));
                currentStamp = currentStamp[3];

                diff = latestStamp - currentStamp;

                latestStamp = currentStamp;

                if (diff >= currentBiggest) {
                    currentSecondBiggest = currentBiggest;
                    currentBiggest = diff;
                } else if (diff > currentSecondBiggest && diff < currentBiggest) {
                    currentSecondBiggest = diff;
                }
            }

            assert.equal(
                previewUSDTValue.toString(),
                currentSecondBiggest.toString()
            );
        });

        it("50 round aggregator ETH", async() => {

            const chainLinkUSDETH = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

            const previewETHValue = await heartbeat.recalibratePreview(
                chainLinkUSDETH
            );

            const aggregatorFetched = await feedETH.aggregator();

            aggregatorETH = await ChainLinkAggregator.at(
                aggregatorFetched
            );

            const lastestRoundDataResponse = await aggregatorETH.latestRoundData();
            const aggregatorRoundID = lastestRoundDataResponse[0];

            const displayLength = new BN(
                aggregatorRoundID
            );

            let roundDataResponse;
            let updatedTime;

            let currentBiggest = new BN(0);
            let currentSecondBiggest = new BN(0);

            const earliestIterableRound = (new BN(displayLength)).sub(new BN(50));

            let iterationCount;

            const MAX_ROUND = new BN(50);

            let diff;
            let latestStamp = lastestRoundDataResponse[3];
            let currentStamp;

            const latestRoundConstant = await heartbeat.getLatestAggregatorRoundId(
                chainLinkUSDETH
            );

            for (i = 1; i < MAX_ROUND; i++) {

                currentStamp = await aggregatorETH.getRoundData(new BN(latestRoundConstant).sub(new BN(i)));
                currentStamp = currentStamp[3];

                diff = latestStamp - currentStamp;

                latestStamp = currentStamp;

                if (diff >= currentBiggest) {
                    currentSecondBiggest = currentBiggest;
                    currentBiggest = diff;
                } else if (diff > currentSecondBiggest && diff < currentBiggest) {
                    currentSecondBiggest = diff;
                }
            }

            assert.equal(
                previewETHValue.toString(),
                currentSecondBiggest.toString()
            );
        });
    });
})
