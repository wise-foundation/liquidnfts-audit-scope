const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect } = require('chai');
const Contract = require('web3-eth-contract');

const data = require("./data.js").data;
require('./utils');
require("./constants");
const { getTokenData } = require("./utils");

const fromWei = web3.utils.fromWei;
const toWei = web3.utils.toWei;

const DUMMY_ADDRESS1 = "0x5866e7451Cdd287a2375eFB669DB69398836A0E3";
const DUMMY_ADDRESS2 = "0x2bfe110B0812D67b3f602D7c3B643b37Cb7B0FC9";

const SECONDS_IN_DAY = 86400;

Contract.setProvider("ws://localhost:9545");

const tokens = (value) => {
    return web3.utils.toWei(value.toString());
}

const debugFlag = false;

const debug = (message) => {
    if (debugFlag) {
        console.log(
            message
        );
    }
}

const getLastEvent = async (eventName, instance) => {
    const events = await instance.getPastEvents(eventName, {
        fromBlock: 0,
        toBlock: "latest",
    });
    return events.pop().returnValues;
};

contract("instantPools", async accounts => {

    const [owner, alice, bob] = accounts;

    let token, pool, nft, factory, router, pricingData,testerPool;

    describe("Borrow Function Tests", () => {

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
                toWei("1"),
                toWei("1"),
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
        })

        it("Basic Standard Interaction Path for borrow works", async() => {

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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            const TOKEN_ID = 1;

            tokOwnerBefore = await nft.ownerOf(1);

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            tokOwnerAfter = await nft.ownerOf(1);

            assert.equal(tokOwnerAfter, pool.address);
            assert.equal(tokOwnerBefore, bob);

            bobBal = await token.balanceOf(bob);

            assert.notEqual( bobBal, new BN('0') );



        });

        it("Too Long of Time Increase becomes maximum", async() => {
            //Need markov mean to be changed to non zero from LASA in order to run this test
            //@TODO fill in this test once scaling algorithm is merged
        });

        it("Correct Number of tokens are transfered for loan after prepay", async() => {
            //@TODO this test will need updating when scaling algorithm merged
            //Just need to update the expected tokens given from borrow, should be quick numerical change
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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            const TOKEN_ID = 1

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(bob);

            debug(bobBal.toString());

            assert.equal( bobBal.toString(), toWei('100') ); //recompute this line after LASA merged
        });

        it("Too Large of requested borrow fails", async() => {

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

            await token.mint(
                toWei("10000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("10000"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("10000"),
                pool.address,
                {
                    from: alice
                }
            );

            const TOKEN_ID = 1;

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

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    toWei("2501"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            )
        });

        it("Internal State Variables update as expected", async() => {
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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            const TOKEN_ID = 1;

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            totalLoaned = await pool.totalTokensDue();

            assert.equal(totalLoaned.toString(), tokens('100'));

            totalBorrowShares = await pool.totalBorrowShares();

            assert.equal(totalBorrowShares.toString(), tokens('100'));

            psuedoTotalTokensHeld = await pool.pseudoTotalTokensHeld();


            assert(
                closeToBn(
                    psuedoTotalTokensHeld,
                    "1000",
                    "1"
                ),
                true
            );

            totalInternalShares = await pool.totalInternalShares();

            assert( closeToBn(
                totalInternalShares,"1000", "1" ));


            totalPoolTokens = await token.balanceOf(pool.address);

            //@TODO This does not have the 1 extra, discuss this with christoph
            assert.equal(
                totalPoolTokens.toString(),
                toWei('900')
            );

            bobsLoan = await pool.currentLoans(
                nft.address,
                "1"
            );

            assert.equal(
                bobsLoan.tokenOwner,
                bob
            );

            assert(
                closeToBn(
                    bobsLoan.borrowShares,
                    "100",
                    "1"
                )
            );

            assert.equal(
                bobsLoan.principalTokens.toString(),
                toWei('100')
            );
        });
    });

    describe("Payback tests", () => {

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

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
            );

            pool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                pool.address
            );

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                toWei("1"),
                toWei("1"),
                [nft.address],
                "Pool Shares",
                "POOL",
            );

            poolCount = await factory.poolCount();

            poolAddress = await factory.predictPoolAddress(
                0,
                token.address,
                factory.address,
                pool.address
            );

            pool = await LiquidPoolTester.at(
                poolAddress
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
        })

        it("Basic execution path test", async () => {
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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("100"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            const TOKEN_ID = 1;

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            due = await pool.totalTokensDue();

            debug(due.toString());

            bsha = await pool.totalBorrowShares();

            debug(bsha.toString());

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("0"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    ['0x0'],
                    {
                        from: bob
                    }
                ),
                "INVALID_PROOF"
            );

            await expectRevert(
                router.paybackFunds(
                    bob,
                    toWei("100"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    [web3.utils.fromUtf8("")],
                    {
                        from: bob
                    }
                ),
                "LiquidRouter: UNKNOWN_POOL"
            );

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("100"),
                    bob,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    [web3.utils.fromUtf8("")],
                    {
                        from: bob
                    }
                ),
                "LiquidPool: UNKNOWN_COLLECTION"
            );

            await router.paybackFunds(
                pool.address,
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(bobBal.toString());

            assert(
                closeToBn(
                    bobBal,
                    "100000000000000000000",
                    "10000000"
                )
            );
        })

        it("Too large of principal payment pays off loan fully anyway, only transfers what it needs", async () => {

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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("1000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(fromWei(bobBal.toString()));

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

            await router.paybackFunds(
                pool.address,
                toWei("200"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob,
                    gas: 3000000
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(fromWei(bobBal.toString()));
            assert(
                closeToBn(
                    bobBal,
                    "1000000000000000000000",
                    "100000000"
                )
            );
        })

        it("Payback Reverts when predicted loan value from markov mean is larger than floor", async () => {

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

            await token.mint(
                toWei("10000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("10000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("10000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("10000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("10000"),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                TOKEN_ID
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
                toWei("2400"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            let borrowRateNow = await pool.borrowRate();
            console.log(
                fromWei(borrowRateNow.toString()),
                "Borrow rate now"
            );
            let depositApy = await pool.getCurrentDepositAPY();

            console.log(
                fromWei(depositApy.toString()),
                "Deposit Apy"
            );

            let poolMarkovMean = await pool.markovMean();

            console.log(
                fromWei(poolMarkovMean.toString()),
                "pool markovmean"
            );

            await pool.setMarkovMean( // calculated by hand with wolframalpha for 0.5 to be 0.025 so this should be too high
                toWei("0.60")
            );

            await time.increase(29 * SECONDS_IN_DAY);

            bobBal = await token.balanceOf(
                bob
            );

            debug(fromWei(bobBal.toString()));

            const currentStampSecond = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampSecond
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampSecond
            );

            await time.increase(smallTime);

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("0"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("0.5"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            await pool.setMarkovMean(
                toWei("0.02")                 // this will make 0.5 enough to offset increase in loanvalue since 0.025 roughly is wolframalpha by hand example
            );

            const currentStampThird = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThird
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThird
            );

            const giantTime = SECONDS_IN_YEAR;

            await time.increase(giantTime);

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("0.5"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "PoolHelper: DEAD_LINK_ETH"
            );

            const currentStampFourth = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampFourth
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampFourth
            );


            await time.increase(smallTime);

            await router.paybackFunds(
                pool.address,
                toWei("0.5"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );
        })

        it("Borrow Share Increase (aka interest) works correctly", async () => {

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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("1000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await pool.setMarkovMean(
                toWei("0.02")
            );

            //10% interest has occured. Expected functionality: User should need to pay off 10 tokens of interest from last period in addition to predicted
            await pool.setTotalBorrowShares(
                toWei("200")
            );

            await pool.setTotalTokensDue(
                toWei("220")
            );

            await time.increase(
                30 * SECONDS_IN_DAY
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                pool.address,
                toWei("5"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            assert(
                closeToBn(
                    bobBal,
                    "1084989975008404790934",
                    "10000000"
                )
            );

            debug(
                bobBal.toString()
            );
        })

        it("Borrow Share Decrease does not break things", async () => {

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

            await token.mint(
                toWei("10000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("10000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("10000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("10000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("10000"),
                pool.address,
                {
                    from: alice
                }
            );

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
                toWei("2499"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await pool.setMarkovMean(
                toWei("0.02")    // wolframalpha value for 0.5 payback is 0.025
            );

            const bshares = await pool.totalBorrowShares();

            console.log(
                bshares.toString(),
                "Bshares"
            );

            //There should be no senario where borrow shares loose value right? Min interest rate would be 0%?
            await pool.setTotalBorrowShares(
                toWei("1250")
            );

            await pool.setTotalTokensDue(
                toWei("1500")
            );

            await time.increase(
                30 * SECONDS_IN_DAY
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );

            const currentStampNew = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampNew
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampNew
            );

            await time.increase(smallTime);

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("0"),
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            await router.paybackFunds(
                pool.address,
                toWei("5"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                bobBal.toString()
            );
        });

        it("Penalties Function correctly", async () => {

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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("1000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await pool.setMarkovMean(
                toWei("0.02")     // wolframalpha gave 0.025 so payback is enough
            );

            //There should be no senario where borrow shares loose value right? Min interest rate would be 0%?
            await pool.setTotalBorrowShares(
                toWei("100")
            );

            await pool.setTotalTokensDue(
                toWei("120")
            );

            await time.increase(
                35 * SECONDS_IN_DAY
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );

            const currentStampNew = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampNew
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampNew
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                pool.address,
                toWei("5"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );

            //5 days later = .5 *4 + 1 % => 3% penalty on 120 tokens => 3.6 tokens
            assert(
                closeToBn(
                    bobBal,
                    "1071386858143035702473",
                    "1000000"
                )
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );
        });

        it("max penalty Test", async () => {

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

            await token.mint(
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.mint(
                toWei("1000"),
                {
                    from: bob
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                toWei("1000"),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

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
                toWei("100"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await pool.setMarkovMean(
                toWei("0.02")    // wolframalpha says 0.025 so payback is enough
            );

            //There should be no senario where borrow shares loose value right? Min interest rate would be 0%?
            await pool.setTotalBorrowShares(
                toWei("100")
            );

            await pool.setTotalTokensDue(
                toWei("120")
            );

            await time.increase(
                38 * SECONDS_IN_DAY
            );

            bobBal = await token.balanceOf(
                bob
            );

            debug(
                fromWei(
                    bobBal.toString()
                )
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                pool.address,
                toWei("5"),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            bobBal = await token.balanceOf(
                bob
            );
        });
    });
})
