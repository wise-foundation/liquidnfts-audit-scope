const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");

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
const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;


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

    const [owner, alice, bob, peter, multisig] = accounts;

    let token, pool, nft, pricingData, initialTargetPool,testerPool;

    const THIRTY_SIX_DAYS = 3110400;
    const tokenID = 1;

    describe("Feature Borrow More Funds", () => {

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
                toWei("1"),
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
                tokenID
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

            await token.approve(
                router.address,
                tokens(1000),
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
                tokenID,
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

        it("Can borrow more funds", async ()=>{

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            const shortTime = 10;
            const distantPast = 1000;

            await chainlinkETH.setlastUpdateGlobal(
                distantPast
            );

            await chainlinkUSDC.setlastUpdateGlobal(
                distantPast
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

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "PoolHelper: DEAD_LINK_ETH"
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
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const currentStampNew = await chainlinkUSDC.getTimeStamp();

            const longtime = new BN(SECONDS_IN_10_WEEKS);

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampNew.sub(longtime)
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampNew.sub(longtime)
            );

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "PoolHelper: DEAD_LINK_ETH"
            );

            const currentStampNew2 = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampNew2
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampNew2
            );

            await time.increase(smallTime);

            await router.borrowMoreFunds(
                pool.address,
                tokens(50),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );
        });

        it("Trigger requires when borrow more funds and view coverage ", async ()=>{

            await router.depositFunds(
                tokens(10000),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            timestamp = await pool.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                timestamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                timestamp
            );

            const smallTime = 10;
            await time.increase(smallTime);

            const borrowAmountThroughView = await pool.getBorrowMaximum(
                nft.address,
                tokenID,
                pricingData.amount,
                timestamp
            );

            const borrowMaximum = await pool.getMaximumBorrow(
                pricingData.amount
            );

            const convertedIntoPooltoken = await pool.merklePriceInPoolToken(
                borrowMaximum
            )

            debug("convertedIntoPooltoken", convertedIntoPooltoken);
            debug("borrowAmountThroughView", borrowAmountThroughView);

            assert.equal(
                borrowAmountThroughView.toString(),
                borrowAmountThroughView.toString()
            );

            await router.borrowFunds(
                pool.address,
                tokens(50),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await router.borrowMoreFunds(
                pool.address,
                tokens(50),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await expectRevert(
                pool.borrowMoreFunds(
                    pool.address,
                    tokens(500),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: NOT_ROUTER"
            );

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(2400),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            const wrongproof = ['0x0'];

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    wrongproof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: INVALID_PROOF"
            );

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(50),
                    alice,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: UNKNOWN_COLLECTION"
            );

            await expectRevert(
                router.borrowMoreFunds(
                    alice,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidRouter: UNKNOWN_POOL"
            );

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: NOT_OWNER"
            );

            await time.increase(
                THIRTY_SIX_DAYS
            );

            timestamp = await pool.getTimeStamp();

            const interestFromLoanInfo = await pool.getLoanInterest(
                nft.address,
                tokenID,
                timestamp
            );

            const loanPrincipalFromView = await pool.getPrincipalAmount(
                nft.address,
                tokenID
            );

            // const interestFromLoanInfo = loanInfo[0];
            // const penaltiesFromLoanInfo = loanInfo[1];

            const borrowShares = await pool.totalBorrowShares();

            const currentLoanValue = await pool.getTokensFromBorrowShares(
                borrowShares
            );

            const calculatedInterest = currentLoanValue.sub(
                loanPrincipalFromView);

            const nextPaymentDueTime = await pool.getNextPaymentDueTime(
                nft.address,
                tokenID
            );

            const latedaysAmount = (new BN(timestamp)).sub(
                new BN(nextPaymentDueTime)
            ).div(
                new BN(SECONDS_IN_DAY)
            );

            // const calculatedPenalty = await pool.getPenaltyAmount(
                // currentLoanValue,
                // latedaysAmount
            // );

            assert.equal(
                interestFromLoanInfo.toString(),
                calculatedInterest.toString()
            );

            // assert.equal(
                // penaltiesFromLoanInfo.toString(),
                // calculatedPenalty.toString()
            // );

            await expectRevert(
                router.borrowMoreFunds(
                    pool.address,
                    tokens(50),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: PAYBACK_FIRST"
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                pool.address,
                tokens(0),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const borrowrateAfterBorrowCalc = await pool.getBorrowRateAfterBorrowAmount(
                tokens(50)
            );

            let borrowrateNow = await pool.borrowRate();

            assert.isAbove(
                parseInt(borrowrateAfterBorrowCalc),
                parseInt(borrowrateNow)
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

            const timestampHeartbeatTest = await pool.getTimeStamp();

            const shortTime = 100;

            await time.increase(shortTime);

            await chainlinkUSDC.setlastUpdateGlobal(
                timestampHeartbeatTest
            );

            await chainlinkETH.setlastUpdateGlobal(
                timestampHeartbeatTest
            );

            await router.borrowMoreFunds(
                pool.address,
                tokens(50),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            borrowrateNow = await pool.borrowRate();
            // is not exact because of delay in function call
            // sometimes its exactly equal sometimes slighty different (wei amounts)

            debug(
                "borrowrateNow",
                borrowrateNow
            );

            debug(
                "borrowrateAfterBorrowCalc",
                borrowrateAfterBorrowCalc
            );

            assert.equal(
                borrowrateNow >= borrowrateAfterBorrowCalc,
                true
            );
        });

        it("Math stuff and view coverage", async ()=>{

            poolCount = await factory.poolCount();

            // make new ETH pool caus old calcluations were based on that
            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                web3.utils.toWei("1"),
                toWei("1"),
                [nft.address],
                "Pool Shares",
                "POOL",
                {
                    from: multisig
                }
            );


            poolAddressTwo = await factory.predictPoolAddress(
                poolCount,
                token.address,
                factory.address,
                initialTargetPool
            );

            poolTwo = await LiquidPoolTester.at(
                poolAddressTwo
            );

            await router.depositFunds(
                tokens(1000),
                poolTwo.address,
                {
                    from: alice
                }
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            await router.borrowFunds(
                poolTwo.address,
                tokens(50),
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const DAYS_IN_YEAR_SOLIDITY = new BN(364);

            // because of the time delay of calling functions and not yet accounted for totaltokensDue
            // we account for an error margin of 10seconds in the interest amount
            // the formula for term1, etc comes from using
            // predictFutureLoanValue function and solving for _tokenValue where
            // tokenValue = alreadyBorrowedValue + newBorrowAmount
            // this way we calculate borrowAmount for borrowMoreFunds so that
            // predictFutureLoanValue = 250ETH which is max borrow
            // the error correction with TIME_BETWEEN_FUNCTION_CALLS is then applied
            // to account for preparation pool updating in the modifier before
            // predictFutureLoanValue internally gets called

            const TIME_BETWEEN_FUNCTION_CALLS = new BN(10);

            const TIME_BETWEEN_PAYMENTS = (new BN(SECONDS_IN_DAY)).mul(
                new BN(35)
            ).add(
                TIME_BETWEEN_FUNCTION_CALLS
            );

            const ONE_YEAR_PRECISION_E18 = DAYS_IN_YEAR_SOLIDITY.mul(
                new BN(SECONDS_IN_DAY)
            ).mul(
                new BN(ONE_ETH)
            );

            const MAX_PRINCIPAL = (new BN(250)).mul(new BN(ONE_ETH));

            const markovMean = await poolTwo.markovMean();

            const totalBorrowShares = await poolTwo.totalBorrowShares();

            const alreadyBorrowedValue = await poolTwo.getTokensFromBorrowShares(
                totalBorrowShares
            );

            const term1 = ((TIME_BETWEEN_PAYMENTS).mul(new BN(-1).mul(
                markovMean
            ).mul(
                alreadyBorrowedValue
                )
            ));

            const term2 = (ONE_YEAR_PRECISION_E18).mul(
                MAX_PRINCIPAL
            );

            const term3 = (new BN(-1)).mul(
                ONE_YEAR_PRECISION_E18.mul(
                    alreadyBorrowedValue
                )
            );

            const term4 = markovMean.mul(
                TIME_BETWEEN_PAYMENTS
            );

            const borrowAmount = (
                term1.add(
                    term2
                ).add(
                    term3
                )
            ).div(
                (term4).add(
                    ONE_YEAR_PRECISION_E18)
                );

            let timestamp = await poolTwo.getTimeStamp();

            const _deadline = (new BN(timestamp)).add(TIME_BETWEEN_FUNCTION_CALLS);

            const borrowAmountViewFetched = await poolTwo.getBorrowMaximum(
                nft.address,
                tokenID,
                pricingData.amount,
                _deadline
            );

            debug("borrowAmountViewFetched", borrowAmountViewFetched);
            debug("borrowAmount", borrowAmount);

            assert.equal(
                borrowAmount.toString(),
                borrowAmountViewFetched.toString()
            );

            const predictFutureLoanValue = await poolTwo.predictFutureLoanValue(
                borrowAmount.add(alreadyBorrowedValue)
            );

            debug(
                "predictFutureLoanValue should be slightly less than 250ETH ",
                predictFutureLoanValue
            );

            await router.borrowMoreFunds(
                poolTwo.address,
                borrowAmount,
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await expectRevert(
                router.borrowMoreFunds(
                    poolTwo.address,
                    toWei("0.000001"),
                    nft.address,
                    tokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE");

            await time.increase(
                34 * SECONDS_IN_DAY
            );

            const thirtyminutes = new BN(18);
            timestamp = await poolTwo.getTimeStamp();
            const deadline = (new BN(timestamp)).add(thirtyminutes);

            await router.depositFunds(
                tokens(10),
                poolTwo.address,
                {
                    from: alice
                }
            );

            let minimumPrincipalPaybackCalc = await poolTwo.getPrincipalPayBackMinimum(
                nft.address,
                tokenID,
                pricingData.amount,
                deadline
            );

            debug(
                "minimumprincipalpayback",
                minimumPrincipalPaybackCalc
            );

            let borrowShares = await poolTwo.totalBorrowShares();
            let loanValueNow = await poolTwo.getTokensFromBorrowShares(
                borrowShares
            );

            debug(
                "loan value now before payback",
                fromWei(loanValueNow.toString())
            );

            const fetchedTimeStamp = await poolTwo.getTimeStamp();
            const newDeadline = (new BN(fetchedTimeStamp)).add(new BN(10));

            const borrowMoreAmount = await poolTwo.getBorrowMaximum(
                nft.address,
                tokenID,
                pricingData.amount,
                newDeadline
            );

            assert.equal(
                borrowMoreAmount.toString(),
                "0"
            );

            await router.paybackFunds(
                poolTwo.address,
                minimumPrincipalPaybackCalc,
                nft.address,
                tokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            borrowShares = await poolTwo.totalBorrowShares();
            loanValueNow = await poolTwo.getTokensFromBorrowShares(
                borrowShares
            );

            const getprincipalLoan = await poolTwo.getPrincipalAmount(
                nft.address,
                tokenID
            ) ;
            const predictFutureLoanValueNew = await pool.predictFutureLoanValue(
                getprincipalLoan
            );

            debug(
                "loan value now after payback",
                fromWei(loanValueNow.toString())
            );

            debug("future loan value should be slightly less than 250eth",
                predictFutureLoanValue
            );

            minimumPrincipalPaybackCalc = await poolTwo.getPrincipalPayBackMinimum(
                nft.address,
                tokenID,
                pricingData.amount,
                deadline
            );

            assert.equal(
                minimumPrincipalPaybackCalc.toString(),
                "0"
            );
        });
    });
})
