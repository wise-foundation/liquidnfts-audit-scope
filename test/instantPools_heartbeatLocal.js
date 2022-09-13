const Chainlink = artifacts.require("TesterChainlink");
const ChainLinkAggregator = artifacts.require("IChainLink");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const LiquidPoolTester = artifacts.require("TesterPool");
const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

// const NFT1155 = artifacts.require("NFT1155");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow, getTokenData} = require('./utils');

const debugFlag = true;

require("./constants");
require("./utils");
const data = require("./data.js").data;


const fromWei = web3.utils.fromWei;
const toWei = web3.utils.toWei;


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

Contract.setProvider("ws://localhost:9545");

contract("instantPools reclibrate localnet", async accounts => {

    const [owner, alice, bob, peter,multisig] = accounts;
    let chainlinkUSDC;
    let token;
    let nft;
    let chainlinkETH;
    let factory;
    let router;
    let initialTargetPool;
    let poolcount;
    let pool;
    let pricingdata;
    let testerPool;

    const BORROW_TOKEN_ID = 1;

    describe("Local Environment with fake round data", () => {

        beforeEach(async() => {

            const phaseId = 1;
            const aggregatorRoundMax = 3;

            token = await ERC20.new(
                "Super Coin",
                "COIN"
            );

            nft = await NFT721.new();

            chainlinkETH = await Chainlink.new(
                toWei("10"),
                18
            );

            chainlinkUSDC = await Chainlink.new(
                toWei("1"),
                18
            );


            factory = await LiquidFactory.new(
                chainlinkETH.address,
                {
                    from: multisig
                }
            );

            const routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address,
                {
                    from: multisig
                }
            );

            initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.5"), // max percentage per loan 50 -> 50%
                [nft.address],
                "Pool Shares",
                "POOL",
                {
                    from: multisig
                }
            );

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn",
                {
                    from: multisig
                }
            );

            poolAddress = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                initialTargetPool
            );

            pool = await LiquidPoolTester.at(
                poolAddress
            );

            pricingData = getTokenData(
                BORROW_TOKEN_ID
            );

        });

        it("feed data to rounds", async ()=> {

            const phaseId = 1;
            const aggregatorRoundMax = 3;

            await chainlinkUSDC.updatePhaseId(
                phaseId
            );

            const currentTime = await chainlinkUSDC.getTimeStamp();

            const timeDistanceOne = new BN(84000);
            const timeDistanceTwo = new BN(89000);
            const timeDistanceThree = new BN(92000);
            // const timeDistanceFour = new BN(99000);

            let timedistances = [];

            timedistances[0] = (new BN(currentTime)).add(timeDistanceOne);
            timedistances[1] = (new BN(currentTime)).add(timeDistanceTwo);
            timedistances[2] = (new BN(currentTime)).add(timeDistanceThree);
            // timedistances[3] = (new BN(currentTime)).add(timeDistanceFour);

            const secondBiggestSolution = timedistances[2] - timedistances[1];

            let currentRoundId;

            await chainlinkUSDC.setGlobalAggregatorRoundId(
                aggregatorRoundMax
            );

            for (i = 1; i <= aggregatorRoundMax; i++) {

                currentRoundId = await router.getRoundIdByByteShift(
                    phaseId,
                    i
                );

                await chainlinkUSDC.setRoundData(
                    currentRoundId,
                    timedistances[i - 1]
                );

            }

            await router.recalibrate(
                chainlinkUSDC.address
            );

            const heartBeatUSDC = await router.chainLinkHeartBeat(
                chainlinkUSDC.address
            );

            assert.equal(
                heartBeatUSDC.toString(),
                secondBiggestSolution.toString(),
            );
        });

        it("feed data to rounds with double datapoints", async ()=> {

            const phaseId = 1;
            const aggregatorRoundMax = 4;

            await chainlinkUSDC.updatePhaseId(
                phaseId
            );

            const currentTime = await chainlinkUSDC.getTimeStamp();

            const timeDistanceOne = new BN(82000);
            const timeDistanceTwo = new BN(89000);
            const timeDistanceThree = new BN(92000);
             const timeDistanceFour = new BN(99000);

            let timedistances = [];

            timedistances[0] = (new BN(currentTime)).add(timeDistanceOne);
            timedistances[1] = (new BN(currentTime)).add(timeDistanceTwo);
            timedistances[2] = (new BN(currentTime)).add(timeDistanceThree);
            timedistances[3] = (new BN(currentTime)).add(timeDistanceFour);

            const secondBiggestSolution = timedistances[1] - timedistances[0];

            let currentRoundId;

            await chainlinkUSDC.setGlobalAggregatorRoundId(
                aggregatorRoundMax
            );

            for (i = 1; i <= aggregatorRoundMax; i++) {

                currentRoundId = await router.getRoundIdByByteShift(
                    phaseId,
                    i
                );

                await chainlinkUSDC.setRoundData(
                    currentRoundId,
                    timedistances[i - 1]
                );

            }

            await router.recalibrate(
                chainlinkUSDC.address
            );

            const heartBeatUSDC = await router.chainLinkHeartBeat(
                chainlinkUSDC.address
            );

            assert.equal(
                heartBeatUSDC.toString(),
                secondBiggestSolution.toString(),
            );
        });
        it("52 rounds first ones should not be accounted for", async ()=> {

            const phaseId = 1;
            const aggregatorRoundMax = 52;

            await chainlinkUSDC.updatePhaseId(
                phaseId
            );

            let currentTime = await chainlinkUSDC.getTimeStamp();

            const timeDistanceOne = new BN(82000);

            let timedistances = [];

            timedistances[0] = new BN(timeDistanceOne);

            let currentRoundId;

            await chainlinkUSDC.setGlobalAggregatorRoundId(
                aggregatorRoundMax
            );

            function getRandomInt(max) {
                return Math.floor(Math.random() * max);
            }

            for (i = 2; i <= aggregatorRoundMax; i++) {

                currentTime = await chainlinkUSDC.getTimeStamp();
                await time.increase(SECONDS_IN_DAY*i);
                timedistances[i-1] = currentTime
                currentRoundId = await router.getRoundIdByByteShift(
                    phaseId,
                    i
                );

                await chainlinkUSDC.setRoundData(
                    currentRoundId,
                    timedistances[i - 1]
                );
            }

            await time.increase(SECONDS_IN_DAY);

            const secondBiggestSolution = timedistances[50] - timedistances[49];
            const biggestSolution = timedistances[51] - timedistances[50];
            const firstDiff = timedistances[1] - timedistances[0];

            await router.recalibrate(
                chainlinkUSDC.address
            );

            const heartBeatUSDC = await router.chainLinkHeartBeat(
                chainlinkUSDC.address
            );

            assert.equal(
                heartBeatUSDC.toString(),
                secondBiggestSolution.toString(),
            );

            assert.isAbove(
                parseInt(biggestSolution),
                parseInt(secondBiggestSolution)
            );

            assert.isAbove(
                parseInt(firstDiff),
                parseInt(biggestSolution)
            );

            assert.isAbove(
                parseInt(firstDiff),
                parseInt(secondBiggestSolution)
            );
        });
    });
})
