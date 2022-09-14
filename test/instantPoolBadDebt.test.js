// TODO: change discount percentage liquidation and fee tests, aswell as new bad debt handling
const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow } = require('./utils');

const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;

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

    const [owner, alice, bob, chad, multisig] = accounts;

    let token, pool, nft;

    describe("Paying back bad debt tests", () => {

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
                chainlinkETH.address,
                {
                    from: multisig
                }
            );

            const routerAddress = await factory.routerAddress();

            router = await LiquidRouter.at(
                routerAddress
            );

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address,
                {
                    from: multisig
                }
            );

            const initialTargetPool = await factory.defaultPoolTarget();

            assert.equal(
                initialTargetPool.toString(),
                testerPool.address.toString()
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                web3.utils.toWei("1"),
                toWei("0.35"), // max percentage per loan 50 -> 50%
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

            pool = await LiquidPoolTester.at(poolAddress);

            await token.mint(
                tokens(10000000),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(100000000),
                {
                    from: alice
                }
            );

            await token.approve(
                pool.address,
                tokens(100000000),
                {
                    from: alice
                }
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

        it("Fee don't get allocated when bad debt occur", async() => {

            const TOKEN_ID = 1;
            const BAD_DEBT_AMOUNT = tokens(10);

            await router.depositFunds(
                tokens(100),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                TOKEN_ID
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await time.increase(
                10 * SECONDS_IN_DAY
            );

            await router.depositFunds(
                tokens(10),
                pool.address,
                {
                    from: alice
                }
            );

            const feeSharesBefore = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(feeSharesBefore),
                parseInt(0)
            );

            await pool.simulateBadDebt(
                alice,
                nft.address,
                TOKEN_ID,
                BAD_DEBT_AMOUNT
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const feeSharesAfter = await pool.internalShares(
                router.address
            );

            assert.equal(
                feeSharesBefore.toString(),
                feeSharesAfter.toString()
            )
        });

        it("Bad debt gets reduced correctly (WETH-Pool)", async() => {

            const TOKEN_ID_1= 1;
            const TOKEN_ID_2 = 2;
            const BAD_DEBT_AMOUNT = tokens(10);
            const TIME_INTERVAL = 10 * SECONDS_IN_DAY;
            const WEEK_52 = 364 * SECONDS_IN_DAY;

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_2,
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
                TOKEN_ID_1
            );

            pricingData2 = getTokenData(
                TOKEN_ID_2
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                TOKEN_ID_1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await time.increase(
                TIME_INTERVAL
            );

            await router.borrowFunds(
                pool.address,
                tokens(20),
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            await pool.simulateBadDebt(
                alice,
                nft.address,
                TOKEN_ID_1,
                BAD_DEBT_AMOUNT
            );

            const borrowRate = await pool.borrowRate();
            const tokensDue = await pool.totalTokensDue();
            const fee = await pool.fee();
            const badDebt = await pool.badDebt();

            assert.equal(
                BAD_DEBT_AMOUNT.toString(),
                badDebt.toString()
            );

            const sharesRouterBefore = await pool.internalShares(
                router.address
            );

            await time.increase(
                TIME_INTERVAL
            );

            const pseudoBefore = await pool.pseudoTotalTokensHeld();

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const sharesRouterAfter = await pool.internalShares(
                router.address
            );

            assert.equal(
                sharesRouterAfter.toString(),
                sharesRouterBefore.toString()
            );

            const pseudoAfter = await pool.pseudoTotalTokensHeld();

            const badDebtAfter = await pool.badDebt();

            const interest = borrowRate
                .mul(Bn(tokensDue))
                .mul(Bn(TIME_INTERVAL))
                .div(Bn(WEEK_52))
                .div(Bn(toWei("1")));

            debug("interest", interest);

            const bareDiff = pseudoAfter
                .sub(pseudoBefore)
                .sub(Bn(toWei("1")));

            const feeCalc = Bn(interest)
                .sub(Bn(bareDiff));

            debug("feeCalc", feeCalc);

            const feePortion = Bn(interest)
                .mul(fee)
                .div(Bn(toWei("1")));

            debug("feePortion", feePortion);

            const difference = badDebt
                .sub(Bn(feePortion));

            debug("difference", difference);
            debug("badDebtAfter", badDebtAfter);

            assert(
                comparingTwoNumbers(
                    feeCalc,
                    feePortion,
                    "0.000001",
                    true
                )
            );

            assert(
                comparingTwoNumbers(
                    badDebtAfter,
                    difference,
                    "0.000001",
                    true
                )
            );
        });

        it("Bad debt gets reduced correctly (USDC-Pool)", async() => {

            const TOKEN_ID_1= 1;
            const TOKEN_ID_2 = 2;
            const BAD_DEBT_AMOUNT = tokens(30);
            const BORROW_1 = tokens(60);
            const BORROW_2 = tokens(35);
            const TIME_INTERVAL =  27 * SECONDS_IN_DAY;

            const WEEK_52 = 364 * SECONDS_IN_DAY;

            poolCount = await factory.poolCount();
            const initialTargetPool = await factory.defaultPoolTarget();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.70"),
                [nft.address],
                "Pool Shares2",
                "POOL2",
                {
                    from: multisig
                }
            );

            const poolAddressTwo = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                initialTargetPool
            );

            const poolTwo = await LiquidPoolTester.at(poolAddressTwo);

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_2,
                {
                    from: bob
                }
            );

            await router.depositFunds(
                tokens(100),
                poolTwo.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                TOKEN_ID_1
            );

            pricingData2 = getTokenData(
                TOKEN_ID_2
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
                poolTwo.address,
                BORROW_1,
                nft.address,
                TOKEN_ID_1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await router.borrowFunds(
                poolTwo.address,
                BORROW_2,
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            await token.approve(
                poolTwo.address,
                tokens(10000),
                {
                    from: alice
                }
            );

            await poolTwo.simulateBadDebt(
                alice,
                nft.address,
                TOKEN_ID_1,
                BAD_DEBT_AMOUNT
            );

            const borrowRate = await poolTwo.borrowRate();
            const tokensDue = await poolTwo.totalTokensDue();
            const fee = await poolTwo.fee();
            const badDebt = await poolTwo.badDebt();

            assert.equal(
                BAD_DEBT_AMOUNT.toString(),
                badDebt.toString()
            );

            const sharesRouterBefore = await poolTwo.internalShares(
                router.address
            );

            await time.increase(
                TIME_INTERVAL
            );

            await router.depositFunds(
                tokens(1),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const sharesRouterAfter = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouterAfter.toString(),
                sharesRouterBefore.toString()
            );

            const badDebtAfter = await poolTwo.badDebt();

            const interest = borrowRate
                .mul(Bn(tokensDue))
                .mul(Bn(TIME_INTERVAL))
                .div(Bn(WEEK_52))
                .div(Bn(toWei("1")));

            debug("interest", interest);

            const feePortion = Bn(interest)
                .mul(fee)
                .div(Bn(toWei("1")));

            debug("feePortion", feePortion);

            const difference = badDebt
                .sub(Bn(badDebtAfter));

            debug("difference", difference);
            debug("badDebtAfter", badDebtAfter);

            assert(
                comparingTwoNumbers(
                    feePortion,
                    difference,
                    "0.00001",
                    true
                )
            );
        });

        it("Bad debt gets paid off correctly and rest of the fees converted to shares (ETH-Pool)", async() => {

            const TOKEN_ID_1= 1;
            const TOKEN_ID_2 = 2;
            const BAD_DEBT_AMOUNT = tokens(1);

            const BORROW_1 = tokens(20);
            const BORROW_2 = tokens(50);

            const TIME_INTERVAL = 10 * SECONDS_IN_DAY;
            const WEEK_52 = 364 * SECONDS_IN_DAY;

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_2,
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                tokens(1000000),
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
                TOKEN_ID_1
            );

            pricingData2 = getTokenData(
                TOKEN_ID_2
            );

            await router.borrowFunds(
                pool.address,
                BORROW_1,
                nft.address,
                TOKEN_ID_1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await time.increase(
                TIME_INTERVAL
            );

            await router.borrowFunds(
                pool.address,
                BORROW_2,
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            await pool.simulateBadDebt(
                alice,
                nft.address,
                TOKEN_ID_1,
                BAD_DEBT_AMOUNT
            );

            await time.increase(
                TIME_INTERVAL
            );

            const routerSharesBefore = await pool.internalShares(
                router.address
            );

            const badDebt1 = await pool.badDebt();
            assert.equal(
                badDebt1.toString(),
                BAD_DEBT_AMOUNT.toString()
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const routerShares2 = await pool.internalShares(
                router.address
            );

            const badDebt2 = await pool.badDebt();
            debug("badDebt2", badDebt2);

            assert.equal(
                routerSharesBefore.toString(),
                routerShares2.toString()
            );

            await time.increase(
                3 * TIME_INTERVAL
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const routerShares3 = await pool.internalShares(
                router.address
            );

            const badDebt3 = await pool.badDebt();
            debug("badDebt3", badDebt3);

            assert.equal(
                routerSharesBefore.toString(),
                routerShares3.toString()
            );

            await time.increase(
                2 * TIME_INTERVAL
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const routerShares4 = await pool.internalShares(
                router.address
            );

            const badDebtLast = await pool.badDebt();
            debug("badDebtLast", badDebtLast);

            assert.equal(
                routerSharesBefore.toString(),
                routerShares4.toString()
            );

            const borrowRate = await pool.borrowRate();
            const tokensDue = await pool.totalTokensDue();
            const fee = await pool.fee();

            const interest = borrowRate
                .mul(Bn(tokensDue))
                .mul(Bn(TIME_INTERVAL))
                .div(Bn(WEEK_52))
                .div(Bn(toWei("1")));

            debug("interest", interest);

            const feePortion = Bn(interest)
                .mul(fee)
                .div(Bn(toWei("1")));

            debug("feePortion", feePortion);

            await time.increase(
                TIME_INTERVAL
            );

            const totIntShares = await pool.totalInternalShares();

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const badDebtZero = await pool.badDebt();
            const pseudoTotal = await pool.pseudoTotalTokensHeld();

            const barePseudoTotal = pseudoTotal
                .sub(Bn(toWei("1")));

            const routerSharesEnd = await pool.internalShares(
                router.address
            );

            assert.equal(
                badDebtZero.toString(),
                "0"
            );

            assert.isAbove(
                parseInt(routerSharesEnd),
                parseInt(routerSharesBefore)
            );

            const diffShares = routerSharesEnd
                .sub(routerSharesBefore);

            debug("diffShares", diffShares);

            const denominator = totIntShares
                .add(Bn(diffShares));

            const calcRestFee = Bn(diffShares)
                .mul(Bn(barePseudoTotal))
                .div(Bn(denominator))

            const feeMinusRestDebt = Bn(feePortion)
                .sub(Bn(badDebtLast));

            debug("calcRestFee", calcRestFee);
            debug("feeMinusRestDebt", feeMinusRestDebt);

            assert(
                comparingTwoNumbers(
                    calcRestFee,
                    feeMinusRestDebt,
                    "0.00001",
                    true
                )
            );

        });

        it("Share allocation works correctly with bad debt when pool is drained (life-cyle-test)", async() => {

            const TOKEN_ID_1= 1;
            const TOKEN_ID_2 = 2;
            const borrowAmount = "2405";
            const littleMoreThanBorrowed = "1560";
            const thirdBorrowAmount = "1550";
            const oneHour = 3600;
            const defaultTime = 35 * SECONDS_IN_DAY + 2 * oneHour;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const longBorrowTime = 50 * SECONDS_IN_DAY

            poolCount = await factory.poolCount();
            const initialTargetPool = await factory.defaultPoolTarget();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("1"),
                [nft.address],
                "Pool Shares2",
                "POOL2",
                {
                    from: multisig
                }
            );

            const poolAddressTwo = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                initialTargetPool
            );

            const poolTwo = await LiquidPoolTester.at(poolAddressTwo)

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_2,
                {
                    from: chad
                }
            );

            await token.mint(
                tokens(HUGE_AMOUNT),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                tokens(HUGE_AMOUNT),
                {
                    from: bob
                }
            );

            await token.mint(
                tokens(HUGE_AMOUNT),
                {
                    from: chad
                }
            );

            await token.approve(
                router.address,
                tokens(HUGE_AMOUNT),
                {
                    from: chad
                }
            );

            await router.depositFunds(
                tokens(10000),
                poolTwo.address,
                {
                    from: alice
                }
            );

            pricingData1 = getTokenData(
                TOKEN_ID_1
            );

            pricingData2 = getTokenData(
                TOKEN_ID_2
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            const sharesRouter1 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter1.toString(),
                "0"
            );

            await router.borrowFunds(
                poolTwo.address,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID_1,
                pricingData1.index,
                pricingData1.amount,
                pricingData1.proof,
                {
                    from: bob
                }
            );

            const sharesRouter2 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter1.toString(),
                sharesRouter2.toString()
            );


            await time.increase(defaultTime);

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);


            await router.liquidateNFT(
                poolTwo.address,
                nft.address,
                TOKEN_ID_1,
                pricingData1.index,
                pricingData1.amount,
                pricingData1.proof,
                {
                    from: bob
                }
            );

            await router.borrowFunds(
                poolTwo.address,
                toWei(thirdBorrowAmount),
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const baddebt1 = await poolTwo.badDebt();
            debug("baddebt1", baddebt1);

            const diff1 = await poolTwo.differencePseudo();

            debug("diff1", diff1);

            const sharesRouter3 = await poolTwo.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(sharesRouter3),
                parseInt(sharesRouter2)
            );

            await time.increase(longBorrowTime);

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                poolTwo.address,
                toWei(littleMoreThanBorrowed),
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const baddebt2 = await poolTwo.badDebt();
            debug("baddebt2", baddebt2);

            const diff2 = await poolTwo.differencePseudo();
            debug("diff2", diff2);

            const NFTLiq1 = await nft.ownerOf(
                TOKEN_ID_2
            );

            assert.equal(
                NFTLiq1,
                chad
            );

            const sharesRouter4 = await poolTwo.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(sharesRouter4),
                parseInt(sharesRouter3)
            );

            const aliceShares = await poolTwo.internalShares(
                alice
            );

            await router.withdrawFunds(
                aliceShares,
                poolTwo.address,
                {
                    from: alice
                }
            );

            await router.withdrawFees(
                [poolTwo.address],
                [sharesRouter4],
                {
                    from: multisig
                }
            );

            const balEnd = await token.balanceOf(
                poolTwo.address
            );

            const sharesEnd = await poolTwo.totalInternalShares();
            debug("sharesEnd", sharesEnd);
            const pseudoEnd = await poolTwo.pseudoTotalTokensHeld();
            debug("pseudoEnd", pseudoEnd);
            const tokenDueEnd = await poolTwo.totalTokensDue();
            debug("tokenDueEnd", tokenDueEnd);
            const borrowSharesEnd = await poolTwo.totalBorrowShares();
            debug("borrowSharesEnd", borrowSharesEnd);
            const borrowRate = await poolTwo.borrowRate();
            debug("borrowRate", borrowRate);
            const totPoolEnd = await poolTwo.totalPool();
            debug("totPoolEnd", totPoolEnd);
            const utiEnd = await poolTwo.utilisationRate();
            debug("utiEnd", utiEnd);

            assert.equal(
                sharesEnd.toString(),
                "1"
            );

            assert.isAbove(
                parseInt(5),
                parseInt(pseudoEnd)
            );

            assert.equal(
                tokenDueEnd.toString(),
                "0"
            );

            assert.equal(
                borrowSharesEnd.toString(),
                "0"
            );

            assert.equal(
                balEnd.toString(),
                "1"
            );
        });

        it("Share allocation works correctly with tokenized shares and bad debt(life-cyle-test)", async() => {

            const TOKEN_ID_1= 1;
            const TOKEN_ID_2 = 2;
            const TOKEN_ID_3 = 3;
            const initDepo = "10000";
            const depoTwo = "333";
            const borrowAmount = "2405";
            const littleMoreThanBorrowed = "1560";
            const secondBorrowAmount = "1550";
            const thirdBorrowAmount = "333";
            const oneHour = 3600;
            const defaultTime = 35 * SECONDS_IN_DAY + 2 * oneHour;
            const HUGE_AMOUNT = toWei("10000000000");
            const smallTime = 10;
            const longBorrowTime = 50 * SECONDS_IN_DAY

            poolCount = await factory.poolCount();
            const initialTargetPool = await factory.defaultPoolTarget();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("1"),
                [nft.address],
                "Pool Shares2",
                "POOL2",
                {
                    from: multisig
                }
            );

            const poolAddressTwo = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                initialTargetPool
            );

            const poolTwo = await LiquidPoolTester.at(poolAddressTwo)

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_2,
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID_3,
                {
                    from: bob
                }
            );

            await token.mint(
                HUGE_AMOUNT,
                {
                    from: chad
                }
            );

            await token.approve(
                router.address,
                HUGE_AMOUNT,
                {
                    from: chad
                }
            );

            await token.mint(
                HUGE_AMOUNT,
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                HUGE_AMOUNT,
                {
                    from: bob
                }
            );

            const pricingData1 = getTokenData(
                TOKEN_ID_1
            );

            const pricingData2 = getTokenData(
                TOKEN_ID_2
            );

            const pricingData3 = getTokenData(
                TOKEN_ID_3
            );

            await router.depositFunds(
                toWei(initDepo),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const internalShareAlice = await poolTwo.internalShares(
                alice
            );

            const tokenShareAliceStart = await poolTwo.balanceOf(
                alice
            );

            assert.equal(
                internalShareAlice.toString(),
                toWei(initDepo).toString()
            );

            assert.equal(
                tokenShareAliceStart.toString(),
                "0"
            );

            const anzTokenShares = internalShareAlice
                .mul(new BN(toWei("0.25")))
                .div(new BN(toWei("1")));

            await poolTwo.tokeniseShares(
                anzTokenShares,
                {
                    from: alice
                }
            );

            const tokenShareAlice = await poolTwo.balanceOf(
                alice
            );

            assert.equal(
                tokenShareAlice.toString(),
                anzTokenShares.toString()
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            const sharesRouter1 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter1.toString(),
                "0"
            );

            await router.borrowFunds(
                poolTwo.address,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID_1,
                pricingData1.index,
                pricingData1.amount,
                pricingData1.proof,
                {
                    from: bob
                }
            );

            const sharesRouter2 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter1.toString(),
                sharesRouter2.toString()
            );

            await time.increase(defaultTime);

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);


            await router.liquidateNFT(
                poolTwo.address,
                nft.address,
                TOKEN_ID_1,
                pricingData1.index,
                pricingData1.amount,
                pricingData1.proof,
                {
                    from: alice
                }
            );

            await router.borrowFunds(
                poolTwo.address,
                toWei(secondBorrowAmount),
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const baddebt1 = await poolTwo.badDebt();
            const diff1 = await poolTwo.differencePseudo();

            debug("diff1", diff1);
            debug("baddebt1", baddebt1);

            await time.increase(SECONDS_IN_DAY);

            await router.depositFunds(
                toWei(depoTwo),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const anzTokenShares2 = internalShareAlice
                .mul(new BN(toWei("0.13")))
                .div(new BN(toWei("1")));

            await poolTwo.tokeniseShares(
                anzTokenShares2,
                {
                    from: alice
                }
            );

            const tokenShareAlice2 = await poolTwo.balanceOf(
                alice
            );

            assert.isAbove(
                parseInt(tokenShareAlice2),
                parseInt(tokenShareAlice)
            );

            const sharesRouter3 = await poolTwo.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(sharesRouter3),
                parseInt(sharesRouter2)
            );

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolTwo.address,
                toWei(thirdBorrowAmount),
                nft.address,
                TOKEN_ID_3,
                pricingData3.index,
                pricingData3.amount,
                pricingData3.proof,
                {
                    from: bob
                }
            );

            const sharesRouter4 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter3.toString(),
                sharesRouter4.toString()
            );

            await time.increase(SECONDS_IN_DAY);

            await router.depositFunds(
                toWei(depoTwo),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const baddebt3 = await poolTwo.badDebt();
            const diff3 = await poolTwo.differencePseudo();

            debug("diff3", diff3);
            debug("baddebt3", baddebt3);

            assert.isAbove(
                parseInt(baddebt1),
                parseInt(baddebt3)
            )

            const currentStamFour = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamFour
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamFour
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                poolTwo.address,
                toWei(littleMoreThanBorrowed),
                nft.address,
                TOKEN_ID_3,
                pricingData3.index,
                pricingData3.amount,
                pricingData3.proof,
                {
                    from: bob
                }
            );

            const NFTLiq3 = await nft.ownerOf(
                TOKEN_ID_3
            );

            assert.equal(
                NFTLiq3,
                bob
            );

            const sharesRouter5 = await poolTwo.internalShares(
                router.address
            );

            assert.equal(
                sharesRouter5.toString(),
                sharesRouter4.toString()
            );

            await time.increase(longBorrowTime);

            await router.depositFunds(
                toWei("1"),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const baddebt4 = await poolTwo.badDebt();
            const diff4 = await poolTwo.differencePseudo();

            debug("diff4", diff4);
            debug("baddebt4", baddebt4);

            await time.increase(4 * longBorrowTime);

            await router.depositFunds(
                toWei("1"),
                poolTwo.address,
                {
                    from: alice
                }
            );

            const currentStampFive = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampFive
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampFive
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                poolTwo.address,
                toWei(littleMoreThanBorrowed),
                nft.address,
                TOKEN_ID_2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const routerShareEnd = await poolTwo.internalShares(
                router.address
            );

            await router.withdrawFees(
                [poolTwo.address],
                [routerShareEnd],
                {
                    from: multisig
                }
            );

            await time.increase(smallTime);

            const aliceEndShare = await poolTwo.internalShares(
                alice
            );

            const aliceEndToken = await poolTwo.balanceOf(
                alice
            );

            const aliceEnd = aliceEndShare
                .add(aliceEndToken);

            await router.withdrawFunds(
                aliceEnd,
                poolTwo.address,
                {
                    from: alice
                }
            );

            const balEnd = await token.balanceOf(
                poolTwo.address
            );

            const sharesEnd = await poolTwo.totalInternalShares();
            debug("sharesEnd", sharesEnd);
            const pseudoEnd = await poolTwo.pseudoTotalTokensHeld();
            debug("pseudoEnd", pseudoEnd);
            const tokenDueEnd = await poolTwo.totalTokensDue();
            debug("tokenDueEnd", tokenDueEnd);
            const borrowSharesEnd = await poolTwo.totalBorrowShares();
            debug("borrowSharesEnd", borrowSharesEnd);
            const borrowRate = await poolTwo.borrowRate();
            debug("borrowRate", borrowRate);
            const totPoolEnd = await poolTwo.totalPool();
            debug("totPoolEnd", totPoolEnd);
            const utiEnd = await poolTwo.utilisationRate();
            debug("utiEnd", utiEnd);

            assert.equal(
                sharesEnd.toString(),
                "1"
            );

            assert.isAbove(
                parseInt(5),
                parseInt(pseudoEnd)
            );

            assert.equal(
                tokenDueEnd.toString(),
                "0"
            );

            assert.equal(
                borrowSharesEnd.toString(),
                "0"
            );

            assert.equal(
                balEnd.toString(),
                "1"
            );

        });
    });
})
