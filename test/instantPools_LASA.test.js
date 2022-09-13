const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink")

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");
// const NFT1155 = artifacts.require("NFT1155");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow, getTokenData} = require('./utils');

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

Contract.setProvider("ws://localhost:9545");

contract("instantPools", async accounts => {

    const [owner, alice, bob, peter] = accounts;

    let token, pool, nft, pricingData,testerPool;

    describe("Initialisation tests", () => {

        beforeEach(async() => {

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
                chainlinkETH.address
            );

            const routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address
            );

            const initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.5"),
                [nft.address],
                // [data.merkleRoot],
                // ["DEADURL"],
                "Pool Shares",
                "POOL",
                // false
            );

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
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

            await token.mint(
                tokens(1000),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(1000),
                {
                    from: alice
                }
            );

            const phaseId = 1;
            const aggregatorRoundMax = 3;

            await chainlinkUSDC.updatePhaseId(
                phaseId
            );

            await chainlinkETH.updatePhaseId(
                phaseId
            );

            const currentTime = await chainlinkUSDC.getTimeStamp();

            const timeDistanceOne = new BN(84000);
            const timeDistanceTwo = new BN(89000);
            const timeDistanceThree = new BN(93000);

            let timedistances = [];

            timedistances[0] = (new BN(currentTime)).add(timeDistanceOne);
            timedistances[1] = (new BN(currentTime)).add(timeDistanceTwo);
            timedistances[2] = (new BN(currentTime)).add(timeDistanceThree);

            let currentRoundId;

            await chainlinkUSDC.setGlobalAggregatorRoundId(aggregatorRoundMax);
            await chainlinkETH.setGlobalAggregatorRoundId(aggregatorRoundMax);

            for (i = 1; i <= aggregatorRoundMax; i++){

                currentRoundId = await router.getRoundIdByByteShift(
                    phaseId,
                    i
                );

                await chainlinkUSDC.setRoundData(
                    currentRoundId,
                    timedistances[i-1]
                );

                await chainlinkETH.setRoundData(
                    currentRoundId,
                    timedistances[i-1]
                );

            }

            await router.recalibrate(chainlinkUSDC.address);
            await router.recalibrate(chainlinkETH.address);

        });

        it("Initialising multiplicativFactor is working as intended", async ()=> {

            let mulFactor = await pool.multiplicativeFactor();

            assert.equal(
                mulFactor.toString(),
                tokens(1).toString()
            );
        });

        it("Initialising Pole is working as intended", async ()=> {

            const startPole = await pool.pole();
            const minPole = await pool.minPole();
            const maxPole = await pool.maxPole();

            const testValueStart = maxPole
                .add(minPole)
                .div(new BN(2));

            assert.equal(
                testValueStart.toString(),
                startPole.toString()
            );

            assert.equal(
                testValueStart.toString(),
                startPole.toString()
            );
        });

        it("Initialising minPole, maxPole, deltaPole is working as intended", async () =>{

            const NORM_FACTOR = 4838400;

            const minPole = await pool.minPole();
            const maxPole = await pool.maxPole();
            const deltapole = await pool.deltaPole();

            debug(
                "minPole",
                minPole
            );

            debug(
                "maxPole",
                maxPole
            );

            let testValueDelta = maxPole
                .sub(minPole)
                .div(new BN(NORM_FACTOR));

            assert.isAbove(
                parseInt(minPole),
                parseInt(tokens(1))
            );

            assert.isAbove(
                parseInt(maxPole),
                parseInt(tokens(1))
            );

            assert.isAbove(
                parseInt(maxPole),
                parseInt(minPole)
            );

            assert.equal(
                testValueDelta.toString(),
                deltapole.toString()
            );
        });

        it("timeStampScaling works as intended", async () => {

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_HOUR
            );

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            let test = await pool.maxPoolShares();

            assert(
                closeToBn(
                    test,
                    "1",
                    "1"
                ),
                true
            );

            await time.increase(
                3 * SECONDS_IN_HOUR
            );

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            let test2 = await pool.maxPoolShares();

            assert(
                closeToBn(
                    test2,
                    "21",
                    "1"
                ),
                true
            );
        });
    });

    describe("Higher Calculation tests and Bools", () => {

        beforeEach(async() => {

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
                chainlinkETH.address
            );

            const routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address
            );

            const initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                web3.utils.toWei("1"),
                [nft.address],
                // [data.merkleRoot],
                // ["DEADURL"],
                "Pool Shares",
                "POOL",
                // false
            );

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
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

            await token.mint(
                tokens(1000000),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(10000),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(10000),
                {
                    from: bob
                }
            );

            const phaseId = 1;
            const aggregatorRoundMax = 3;

            await chainlinkUSDC.updatePhaseId(
                phaseId
            );

            await chainlinkETH.updatePhaseId(
                phaseId
            );

            const currentTime = await chainlinkUSDC.getTimeStamp();

            const timeDistanceOne = new BN(84000);
            const timeDistanceTwo = new BN(89000);
            const timeDistanceThree = new BN(93000);

            let timedistances = [];

            timedistances[0] = (new BN(currentTime)).add(timeDistanceOne);
            timedistances[1] = (new BN(currentTime)).add(timeDistanceTwo);
            timedistances[2] = (new BN(currentTime)).add(timeDistanceThree);

            let currentRoundId;

            await chainlinkUSDC.setGlobalAggregatorRoundId(aggregatorRoundMax);
            await chainlinkETH.setGlobalAggregatorRoundId(aggregatorRoundMax);

            for (i = 1; i <= aggregatorRoundMax; i++){

                currentRoundId = await router.getRoundIdByByteShift(
                    phaseId,
                    i
                );

                await chainlinkUSDC.setRoundData(
                    currentRoundId,
                    timedistances[i-1]
                );

                await chainlinkETH.setRoundData(
                    currentRoundId,
                    timedistances[i-1]
                );

            }

            await router.recalibrate(chainlinkUSDC.address);
            await router.recalibrate(chainlinkETH.address);

        });

        it("newMaxPoolShares condition and calculations work as intended", async ()=>{

            let value = await pool.pole();

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(5),
                pool.address,
                {
                    from: alice
                }
            );

            let share1 = await pool.totalInternalShares();
            let sharePrev1 = await pool.previousValue();

            assert(
                closeToBn(
                    sharePrev1,
                    "100",
                    "1"
                ),
                true
            );

            debug(
                "share1",
                share1
            );

            debug(
                "sharePrev1",
                sharePrev1
            );

            let val1 = await pool.maxPoolShares();

            assert(
                closeToBn(
                    val1,
                    "100",
                    "1"
                ),
                true
            );

            debug(
                "vali1",
                val1
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                5 * SECONDS_IN_HOUR
            );

            await router.depositFunds(
                tokens(5),
                pool.address,
                {
                    from: alice
                }
            );

            let share2 = await pool.totalInternalShares();
            let sharePrev2 = await pool.previousValue();

            assert(
                closeToBn(
                    sharePrev2,
                    "120",
                    "0.00000000000000001"
                )
            );

            debug(
                "share2",
                share2
            );
            debug(
                "sharePrev2",
                sharePrev2
            );

            let val2 = await pool.maxPoolShares();

            assert(
                closeToBn(
                    val2,
                    toWei("120").toString(),
                    "1"
                ),
                true
            );

            debug(
                "vali1",
                val1
            );

            let value2 = await pool.pole();

            assert.equal(
                value.toString(),
                value2.toString()
            );

            assert.isAbove(
                parseInt(val2),
                parseInt(val1)
            );

        });

        it("change pole factor condition and calculations work as intended (no inverting)", async () => {

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                1,
                {
                    from: bob
                }
            );

            await nft.mint(
                {
                    from: alice
                }
            );

            await nft.approve(
                router.address,
                2,
                {
                    from: alice
                }
            );

            await nft.mint(
                {
                    from: peter
                }
            );

            await nft.approve(
                router.address,
                3,
                {
                    from: peter
                }
            );

            await token.transfer(
                bob,
                tokens(1000),
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(50),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(
                30 * SECONDS_IN_3HOUR
            );

            let TOKEN_ID = 2;

            pricingData = getTokenData(
                TOKEN_ID
            );

            let currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            const smallTime = 10;
            await time.increase(smallTime);

            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let pole1 = await pool.pole();

            debug(
                "pole1",
                pole1
            );

            await time.increase(
                SECONDS_IN_3HOUR
            );

            //increase shares for new max Value

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(SECONDS_IN_3HOUR);

            TOKEN_ID = 3

            pricingData = getTokenData(
                TOKEN_ID
            );

            currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: peter
                }
            );

            await time.increase(1);

            TOKEN_ID = 1;

            pricingData = getTokenData(
                TOKEN_ID
            );

            await router.borrowFunds(
                pool.address,
                tokens(90),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let pole2 = await pool.pole();

            debug(
                "pole2",
                pole2
            );

            assert.equal(
                pole2.toString(),
                pole1.toString()
            );

            await time.increase(60);

            await router.withdrawFunds(
                tokens(21),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(2 * SECONDS_IN_3HOUR);

            await router.withdrawFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            let pole3 = await pool.pole();

            debug(
                "pole3",
                pole3
            );

            assert.isAbove(
                parseInt(pole2),
                parseInt(pole3)
            );
        });

        it("change pole factor condition and calculations work as intended (inverting)", async () => {

            let pole1 = await pool.pole();

            debug(
                "pole1",
                pole1
            );

            await token.transfer(
                bob,
                tokens(1000),
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_3HOUR
            );

           //trigger setting max value

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: bob
                }
            );

            let pole2 = await pool.pole();

            debug(
                "pole2",
                pole2
            );

            assert.equal(
                pole2.toString(),
                pole1.toString()
            );

            //trigger changing scalingFactor (1)

            await time.increase(SECONDS_IN_3HOUR);

            await router.withdrawFunds(
                tokens(23),
                pool.address,
                {
                    from: alice
                }
            );

            let pole3 = await pool.pole();

            debug(
                "pole3",
                pole3
            );

            assert.isAbove(
                parseInt(pole3),
                parseInt(pole2)
            );

            //trigger further change in scalingFactor (no switch) (2)

            await time.increase(SECONDS_IN_3HOUR);

            await router.depositFunds(
                tokens(12),
                pool.address,
                {
                    from: alice
                }
            );

            let pole4 = await pool.pole();

            debug(
                "pole4",
                pole4
            );

            assert.isAbove(
                parseInt(pole4),
                parseInt(pole3)
            );

            //trigger further change in scalingFactor (switch) (3)

            await time.increase(SECONDS_IN_3HOUR);

            await router.withdrawFunds(
                tokens(30),
                pool.address,
                {
                    from: bob
                }
            );

            let pole5 = await pool.pole();

            debug(
                "pole5",
                pole5
            );

            assert.isAbove(
                parseInt(pole4),
                parseInt(pole5)
            );
        });

        it("change pole factor condition and calculations work as intended (no inverting) TRIGGER UNCOVERED LINES", async () => {

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                1,
                {
                    from: bob
                }
            );

            await nft.mint(
                {
                    from: alice
                }
            );

            await nft.approve(
                router.address,
                2,
                {
                    from: alice
                }
            );

            await nft.mint(
                {
                    from: peter
                }
            );

            await nft.approve(
                router.address,
                3,
                {
                    from: peter
                }
            );

            await token.transfer(
                bob,
                tokens(1000),
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(50),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(
                30 * SECONDS_IN_3HOUR
            );

            let TOKEN_ID = 2;

            pricingData = getTokenData(
                TOKEN_ID
            );

            let currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            const smallTime = 10;
            await time.increase(smallTime);

            //trigger
            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let minPole = await pool.minPole();

            let pole1 = await pool.pole();

            debug(
                "pole1",
                pole1
            );

            await time.increase(
                SECONDS_IN_3HOUR
            );

            //increase shares for new max Value

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(SECONDS_IN_3HOUR);

            TOKEN_ID = 3

            pricingData = getTokenData(
                TOKEN_ID
            );

            currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: peter
                }
            );

            await time.increase(1);


            TOKEN_ID = 1;

            pricingData = getTokenData(
                TOKEN_ID
            );

            await router.borrowFunds(
                pool.address,
                tokens(90),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let pole2 = await pool.pole();

            debug(
                "pole2",
                pole2
            );

            assert.equal(
                pole2.toString(),
                pole1.toString()
            );

            await time.increase(60);

            await router.withdrawFunds(
                tokens(21),
                pool.address,
                {
                    from: bob
                }
            );

            let contractRate = await pool.borrowRate();
            let tokendue = await pool.totalTokensDue();

            debug(
                "contractRate",
                contractRate
            );

            debug(
                "tokendue",
                tokendue
            );

            const CONST = new BN(ONE_ETH)
                .mul(new BN(SECONDS_IN_YEAR));

            let numberToken = contractRate
                .mul(tokendue)
                .mul(new BN( 2 * SECONDS_IN_YEAR))
                .div(new BN(CONST));

            debug(
                "numberToken",
                numberToken
            );

            await time.increase(
                2 * SECONDS_IN_10_WEEKS
            );

            await router.withdrawFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            let pole3 = await pool.pole();

            debug(
                "pole3",
                pole3
            );

            assert.equal(
                minPole.toString(),
                pole3.toString()
            );

            assert.isAbove(
                parseInt(pole2),
                parseInt(pole3)
            );
        });

        it("change pole factor condition and calculations work as intended (inverting) TRIGGER UNCOVERED LINES", async () => {

            let pole1 = await pool.pole();
            let maxPole = await pool.maxPole();

            debug(
                "pole1",
                pole1
            );

            await token.transfer(
                bob,
                tokens(1000),
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_3HOUR
            );

           //trigger setting max value

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: bob
                }
            );

            let pole2 = await pool.pole();

            debug(
                "pole2",
                pole2
            );

            assert.equal(
                pole2.toString(),
                pole1.toString()
            );

            //trigger changing scalingFactor (1)

            await time.increase(SECONDS_IN_3HOUR);

            await router.withdrawFunds(
                tokens(23),
                pool.address,
                {
                    from: alice
                }
            );

            let pole3 = await pool.pole();

            debug(
                "pole3",
                pole3
            );

            assert.isAbove(
                parseInt(pole3),
                parseInt(pole2)
            );

            //trigger further change in scalingFactor (no switch) (2)

            await time.increase(
                2 * SECONDS_IN_10_WEEKS
            );

            await router.depositFunds(
                tokens(12),
                pool.address,
                {
                    from: alice
                }
            );

            let pole4 = await pool.pole();

            debug(
                "pole4",
                pole4
            );

            assert.isAbove(
                parseInt(pole4),
                parseInt(pole3)
            );

            assert.equal(
                maxPole.toString(),
                pole4.toString()
            );
        });

        it("reset pole factor condition and calculations work as intended", async () => {

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                1,
                {
                    from: bob
                }
            );

            await nft.mint(
                {
                    from: alice
                }
            );

            await nft.approve(
                router.address,
                2,
                {
                    from: alice
                }
            );

            await token.transfer(
                bob,
                tokens(1000),
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(200),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(1);

            await router.depositFunds(
                tokens(50),
                pool.address,
                {
                    from: bob
                }
            );

            await time.increase(30 * SECONDS_IN_3HOUR);

            let TOKEN_ID = 2;

            pricingData = getTokenData(
                TOKEN_ID
            );

            let currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            const smallTime = 10;
            await time.increase(smallTime);

            //trigger deposit
            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let pole1 = await pool.pole();

            debug(
                "pole1",
                pole1
            );

            await time.increase(SECONDS_IN_3HOUR);

            //decrease shares for decreases step pole factor"
            await time.increase(1);

            await router.withdrawFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(SECONDS_IN_3HOUR);

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: bob
                }
            );

            let pole2 = await pool.pole();

            TOKEN_ID = 1;

            pricingData = getTokenData(
                TOKEN_ID
            );

            currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                pool.address,
                tokens(1),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            debug(
                "pole2",
                pole2
            );

            assert.isAbove(
                parseInt(pole1),
                parseInt(pole2)
            );

            await router.withdrawFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                2 * SECONDS_IN_3HOUR
            );

            await router.withdrawFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            let maxPoolShares = await pool.maxPoolShares();
            let totalShare = await pool.totalInternalShares();
            let pole3 = await pool.pole();

            debug(
                "pole3",
                pole3
            );

            assert.equal(
                pole1.toString(),
                pole3.toString()
            );

            assert.equal(
                maxPoolShares.toString(),
                totalShare.toString()
            );
        });
    });
})
