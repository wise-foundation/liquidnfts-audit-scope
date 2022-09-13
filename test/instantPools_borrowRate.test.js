const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");
const {BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect, assert } = require('chai');
const timeMachine = require('ganache-time-traveler');
const Contract = require('web3-eth-contract');

const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;

const Bn = (_value) => {
    return new BN(_value)
}

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

    const [owner, alice, bob, multisig] = accounts;

    let token, pool, nft, pricingData, router, factory,testerPool;

    describe("Initialization tests", () => {

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
                "Pool Shares",
                "POOL",
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
            const timeDistanceThree = new BN(92000);

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

        it("utilisation is initalized correctly", async() => {

            let value = await pool.utilisationRate();

            assert.equal(
                value.toString(),
                "0"
            );
        });

        it("totalPool is initalized correctly", async() => {

            let value = await pool.totalPool()

            assert.equal(
                value.toString(),
                "0"
            );
        });

        it("markovMean is initalized correctly", async() => {

            let value = await pool.markovMean()

            assert.equal(
                value.toString(),
                "0"
            );
        });

        it("borrowRate is initalized correctly", async() => {

            let value = await pool.borrowRate()

            assert.equal(
                value.toString(),
                "0"
            );
        });

        it("pseudoTotalTokensHeld is initalized correctly", async() => {

            let value = await pool.pseudoTotalTokensHeld();
            let one = new BN(1);

            assert.equal(
                value.sub(one),
                0
            );
        });

        it("totalTokensDue is initalized correctly", async() => {

            let value = await pool.totalTokensDue()

            assert.equal(
                value.toString(),
                "0"
            );
        });

        it("totalInternalShares is initalized correctly", async() => {

            let value = await pool.totalInternalShares();
            let one = new BN(1);

            assert.equal(
                value.sub(one),
                0
            );
        });

        it("totalBorrowShares is initalized correctly", async() => {

            let value = await pool.totalBorrowShares()

            assert.equal(
                value.toString(),
                "0"
            );
        });
    });

    describe("Updating pseudo Pools tests", () => {

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
                "Pool Shares",
                "POOL",
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
                tokens(100000),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(100000),
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
            const timeDistanceThree = new BN(92000);

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

        it("Updating pseudoTotalPool and pseudoTotalBorrowAmount works as intended (no borrow)", async() => {

            await router.depositFunds(
                tokens(25),
                pool.address,
                {
                    from: alice
                }
            );

            let pseudoAmount = await pool.pseudoTotalTokensHeld();
            let pseudoAmountBorrow = await pool.totalTokensDue();

            assert(
                closeToBn(
                    pseudoAmount,
                    "25",
                    "1"
                )
            );

            assert.equal(
                pseudoAmountBorrow.toString(),
                "0"
            );

            await time.increase(
                2 * SECONDS_IN_DAY
            );

            await router.depositFunds(
                tokens(25),
                pool.address,
                {
                    from: alice
                }
            );

            let pseudoAmount2 = await pool.pseudoTotalTokensHeld();
            let pseudoAmountBorrow2 = await pool.totalTokensDue();

            assert(
                closeToBn(
                    pseudoAmount2,
                    "50",
                    "1"
                )
            );

            assert.equal(
                pseudoAmountBorrow2.toString(),
                "0"
            );

            assert.equal(
                pseudoAmountBorrow2.toString(),
                pseudoAmountBorrow.toString()
            );

            debug(
                "",
                pseudoAmount
            );

            debug(
                "",
                pseudoAmount2
            );
        });

        it("Updating pseudoTotalPool and pseudoTotalBorrowAmount works as intended (with borrow)", async() => {

            let TEN18 = ONE_ETH;
            const TOKEN_ID = 1;

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID,
                {
                    from: bob
                }
            );

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            let pseudoAmount = await pool.pseudoTotalTokensHeld();
            let pseudoAmountBorrow = await pool.totalTokensDue();

            assert(
                closeToBn(
                    pseudoAmount,
                    "1000",
                    "1"
                )
            );

            assert.equal(
                pseudoAmountBorrow.toString(),
                "0"
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            // use helper function to retrieve data
            pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(50),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let pseudoAmount2 = await pool.pseudoTotalTokensHeld();
            let pseudoAmountBorrow2 = await pool.totalTokensDue();
            let ratePool = await pool.borrowRate();

            assert.equal(
                pseudoAmountBorrow2.toString(),
                tokens(50).toString()
            );

            assert(
                closeToBn(
                    pseudoAmount2,
                    "1000",
                    "1"
                )
            );

            debug(
                "ratePool",
                ratePool
            );

            debug(
                "pseudoBorrow2",
                pseudoAmountBorrow2
            )

            await time.increase(
                SECONDS_IN_YEAR
            );

            let pseudoAmountBorrowEND = await pool.totalTokensDue();
            let pseudoAmountEND = await pool.pseudoTotalTokensHeld();

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            pseudoAmountBorrowEND = await pool.totalTokensDue();
            pseudoAmountEND = await pool.pseudoTotalTokensHeld();

            let increaseAmount = ratePool
                .mul(pseudoAmountBorrow2)
                .div(new BN(TEN18));

            let diffPseudoBorrow = pseudoAmountBorrowEND
                .sub(pseudoAmountBorrow2)

            let diffPseudoTotal = pseudoAmountEND
                .sub(pseudoAmount2)
                .sub(new BN(tokens(1)));

            debug(
                "increaseAmount",
                increaseAmount
            );
            debug(
                "diffPseudoBorrow",
                diffPseudoBorrow
            );
            debug(
                "diffPseudoTotal",
                diffPseudoTotal
            );

            assert.equal(
                diffPseudoBorrow.toString(),
                diffPseudoTotal.toString()
            );

            /*  assert.equal(
                diffPseudoBorrow.toString(),
                increaseAmount.toString()
            ); */

            // assert.isAbove(

            assert(
                comparingTwoNumbers(
                    diffPseudoBorrow,
                    increaseAmount,
                    "0.00001",
                    true
                )
            );
        });
    });

    describe("Testing preparation functions", () => {

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
                "Pool Shares",
                "POOL",
            );

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
            );

            await expectRevert(
                router.addMerkleRoot(
                    nft.address,
                    data.merkleRoot,
                    "ipfs://wise/lqnftstkn"
                ),
                "LiquidRouter: OVERWRITE_DENIED"
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
        });

        it("CleanUp works as intended", async() => {

            await router.depositFunds(
                tokens(50),
                pool.address,
                {
                    from: alice
                }
            );

            token.transfer(
                pool.address,
                tokens(50),
                {
                    from: alice
                }
            );

            let pseudoPool2 = await pool.pseudoTotalTokensHeld();
            let totalPool2 = await pool.totalPool();

            assert(
                closeToBn(
                    pseudoPool2,
                    "50",
                    "1"
                )
            );

            assert.equal(
                totalPool2.toString(),
                tokens(50)
            );

            await time.increase(10);
            await router.depositFunds(
                tokens(50),
                pool.address,
                {
                    from: alice
                }
            );

            let poolAmountPseudo = await pool.pseudoTotalTokensHeld();
            let poolAmountTotal = await pool.totalPool();

            assert(
                closeToBn(
                    poolAmountPseudo,
                    "150",
                    "1"
                )
            );

            assert(
                closeToBn(
                    poolAmountTotal,
                    "150",
                    "1"
                )
            );
        });
    });

    describe("Calculation borrow rates tests", () => {

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
                "Pool Shares",
                "POOL",
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
            const timeDistanceThree = new BN(92000);

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

        it("Calculating borrow rates works as intendend", async() => {

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

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            let borrowRate = await pool.borrowRate();

            assert.equal(
                borrowRate.toString(),
                "0"
            );

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            borrowRate = await pool.borrowRate();

            assert.equal(
                borrowRate.toString(),
                "0"
            );

            pricingData = getTokenData(
                1
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(10),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let borrowRate2 = await pool.borrowRate()

            assert.isAbove(
                parseInt(borrowRate2),
                parseInt(0)
            );

            pricingData = getTokenData(
                2
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                2,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let borrowRate3 = await pool.borrowRate()

            assert.isAbove(
                parseInt(borrowRate3),
                parseInt(borrowRate2)
            );
        });

        it("Calculating exact borrow rate value works as intendend", async() => {

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

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                1
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(10),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let utilisation = await pool.utilisationRate();
            let mulFactor = await pool.multiplicativeFactor();
            let pole = await pool.pole();
            let contractRate = await pool.borrowRate();

            let numerator = mulFactor
                .mul(utilisation)
                .mul(new BN(tokens(1)));

            let denominator = (pole
                .sub(utilisation))
                .mul(pole);

            let calcRate = numerator
                .div(denominator);

            debug(
                "calcRate",
                calcRate
            );

            debug(
                "contractRate",
                contractRate
            );

            assert.equal(
                calcRate.toString(),
                contractRate.toString()
            );
        });
    });

    describe("Calculation Markov mean tests", () => {

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
                "Pool Shares",
                "POOL",
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
            const timeDistanceThree = new BN(92000);

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

        it("Calculating Markov mean works as intendend", async() => {

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

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            let markovMean = await pool.markovMean();

            assert.equal(
                markovMean.toString(),
                "0"
            );

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            markovMean = await pool.markovMean();

            assert.equal(
                markovMean.toString(),
                "0"
            );

            pricingData = getTokenData(
                1
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(10),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let markovMean2 = await pool.markovMean()

            assert.isAbove(
                parseInt(markovMean2),
                parseInt(0)
            );

            pricingData = getTokenData(
                2
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                2,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let markovMean3 = await pool.markovMean()

            assert.isAbove(
                parseInt(markovMean3),
                parseInt(markovMean2)
            );
        });

        it("Calculating exact Markov mean value works as intendend", async() => {

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

            let MARKOV_FRACTION = tokens(0.98);
            let TEN18 = tokens(1);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                2
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(10),
                nft.address,
                2,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            let contractRate = await pool.borrowRate();
            let contractMarcovFirst = await pool.markovMean();

            let calcMarovFirst = contractRate
                .mul(new BN(MARKOV_FRACTION))
                .div(new BN(TEN18))

            assert.equal(
                calcMarovFirst.toString(),
                contractMarcovFirst.toString()
            )

            pricingData = getTokenData(
                1
            );

            await router.borrowFunds(
                pool.address,
                tokens(40),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            contractRate = await pool.borrowRate();
            let contractMarcovSecond = await pool.markovMean();

            let addTerm = new BN(TEN18)
                .sub(new BN(MARKOV_FRACTION))
                .mul(calcMarovFirst);

            let calcMarovSecond = contractRate
                .mul(new BN(MARKOV_FRACTION))
                .add(addTerm)
                .div(new BN(TEN18))

            debug(
                "calcMarovSecond",
                calcMarovSecond
            );

            debug(
                "contractMarcovSecond",
                contractMarcovSecond
            );

            assert.equal(
                calcMarovSecond.toString(),
                contractMarcovSecond.toString()
            );
        });
    });

    describe("Nft transfer tests", () => {

        it("Zero address as nft contract", async () => {

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
                "Pool Shares",
                "POOL",
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

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                1
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

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
                tokens(10),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            pricingData = getTokenData(
                2
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                2,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );
        });

        it("Borrow against nft collection that exists but no token minted", async () => {

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
            const initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("50"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                1
            );

            await expectRevert.unspecified(
                router.borrowFunds(
                    pool.address,
                    tokens(20),
                    nft.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: alice
                    }
                ),
            );
        });

        it("Borrow against nft that another person owns", async () => {

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
            const initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("50"),
                [nft.address],
                "Pool Shares",
                "POOL",
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
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                2,
                {
                    from: bob
                }
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

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                1
            );

            await expectRevert.unspecified(
                router.borrowFunds(
                    pool.address,
                    tokens(20),
                    nft.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: alice
                    }
                )
            );
        });
    });

    describe("Computation tests for borrow and deposit APY", () => {

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
            )

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
                "Pool Shares",
                "POOL",
            );

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
            );

            pool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                pool.address
            );

            poolAddress = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                pool.address
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

        it("borrow rate gets calculated correctly and compared with hard coded values", async () => {

            const utilisation1 = "0.20";
            const pole1 = "1.01";

            const utilisation2 = "0.03";
            const pole2 = "1.0054";

            // set hardcoded value for easier comparison
            await pool.setUtilisation(
                toWei(utilisation1)
            );

            // set hardcoded value for easier comparision
            await pool.setPole(
                toWei(pole1)
            );

            // calculating new borrow rate with predefined values to check if computation is correct
            await pool.newBorrowRate();

            // multiplicationFacor = 1E18
            const mulFactor = await pool.multiplicativeFactor();

            const borrowRate1 = await pool.borrowRate();

            const difference1 = Bn(toWei(pole1))
                .sub(Bn(toWei(utilisation1)));

            const denominator1 = Bn(difference1)
                .mul(Bn(toWei(pole1)));

            const nummerator1 = Bn(mulFactor)
                .mul(Bn(toWei(utilisation1)))
                .mul(Bn(toWei("1")));

            const computedValue1 = Bn(nummerator1)
                .div(Bn(denominator1));

            // hardcoded value computed from wolfram alpha with above values
            const hardcoded1 = toWei("0.244468891333577802");

            debug("borrowRate1", borrowRate1);
            debug("hardcoded1", hardcoded1);
            debug("computedValue1", computedValue1);

            assert.equal(
                borrowRate1.toString(),
                computedValue1.toString()
            );

            // to be sure make a second round with new values

            // set hardcoded value for easier comparison
            await pool.setUtilisation(
                toWei(utilisation2)
            );

            // set hardcoded value for easier comparision
            await pool.setPole(
                toWei(pole2)
            );

            await pool.newBorrowRate();

            const borrowRate2 = await pool.borrowRate();

            const difference2 = Bn(toWei(pole2))
                .sub(Bn(toWei(utilisation2)));

            const denominator2 = difference2
                .mul(Bn(toWei(pole2)));

            const computedValue2 = Bn(mulFactor)
                .mul(Bn(toWei(utilisation2)))
                .mul(Bn(toWei("1")))
                .div(denominator2);

            // hardcoded value computed from wolfram alpha with above values
            const hardcoded2 = toWei("0.030591419009075413");

            debug("borrowRate2", borrowRate2);
            debug("hardcoded2", hardcoded2);
            debug("computedValue2", computedValue2)

            assert.equal(
                borrowRate2.toString(),
                computedValue2.toString()
            );
        });

        it("deposit rate gets calculated correctly and compared with hard coded values", async () => {

            const utilisation1 = "0.35";
            const pole1 = "1.02";
            const pseudoToken1 = "10";
            const totalTokenDue1 = "5";

            const utilisation2 = "0.73";
            const pole2 = "1.067";
            const pseudoToken2 = "165";
            const totalTokenDue2 = "153";

            // multiplicationFacor = 1E18

            // fee is 20% = 2E17
            const fee = await pool.fee();

            const difference = Bn(toWei("1"))
            .sub(Bn(fee));

            // set hardcoded value for easier comparison
            await pool.setUtilisation(
                toWei(utilisation1)
            );

            // set hardcoded value for easier comparision
            await pool.setPole(
                toWei(pole1)
            )

            // calculating new borrow rate with predefined values to check if computation is correct
            await pool.newBorrowRate();

            // 10 token inside the contract
            await pool.setPseudoTotalTokensHeld(
                toWei(pseudoToken1)
            );

            // 5 token borrowed
            await pool.setTotalTokensDue(
                toWei(totalTokenDue1)
            );

            const depositAPY1 = await pool.getCurrentDepositAPY();
            const borrowRate1 = await pool.borrowRate();

            // hardcoded value computed from wolfram alpha with above values
            const depositHardcoded1 = toWei("0.204858062628036289");

            const computedValue1 = Bn(borrowRate1)
                .mul(Bn(difference))
                .mul(Bn(toWei(totalTokenDue1)))
                .div(Bn(toWei(pseudoToken1)))
                .div(Bn(toWei("1")));

            debug("depositAPY1", depositAPY1);
            debug("computedValue1",computedValue1);
            debug("depositHardcoded1", depositHardcoded1)

            assert.equal(
                depositAPY1.toString(),
                computedValue1.toString()
            );

            // doing same calculations with different values

            // set hardcoded value for easier comparison
            await pool.setUtilisation(
                toWei(utilisation2)
            );

            // set hardcoded value for easier comparision
            await pool.setPole(
                toWei(pole2)
            )

            // calculating new borrow rate with predefined values to check if computation is correct
            await pool.newBorrowRate();

            // 10 token inside the contract
            await pool.setPseudoTotalTokensHeld(
                toWei(pseudoToken2)
            );

            // 5 token borrowed
            await pool.setTotalTokensDue(
                toWei(totalTokenDue2)
            );

            const depositAPY2 = await pool.getCurrentDepositAPY();
            const borrowRate2 = await pool.borrowRate();

            // hardcoded value computed from wolfram alpha with above values
            const depositHardcoded2 = toWei("1.506003611799556501");

            const computedValue2 = Bn(borrowRate2)
                .mul(Bn(difference))
                .mul(Bn(toWei(totalTokenDue2)))
                .div(Bn(toWei(pseudoToken2)))
                .div(Bn(toWei("1")));

            debug("depositAPY2", depositAPY2);
            debug("computedValue2",computedValue2);
            debug("depositHardcoded2", depositHardcoded2);

            assert.equal(
                depositAPY2.toString(),
                computedValue2.toString()
            );
        });
    })
});
