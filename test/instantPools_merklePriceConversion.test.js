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

const debugFlag = true;

require("./constants");
require("./utils");
const data = require("./data.js").data;

function debug( message1, message2 ){
    if (debugFlag){
        console.log(message1 + ": " + message2.toString());
    }
}

Contract.setProvider("ws://localhost:9545");

contract("instantPools", async accounts => {

    const [owner, alice, bob] = accounts;

    let token, pool, nft, pricingData, router, factory, poolCount, initialTargetPool,testerPool;

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

            const newPool = await LiquidPoolTester.new();
            await factory.updateDefaultPoolTarget(
                newPool.address
            );

            const routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address
            );

            initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await router.addMerkleRoot(
                nft.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn"
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

            await nft.mint(
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
                1,
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

        it("ETH pool merkle price not affected (collfactor 100%)", async() => {

            const TOKEN_ID = 1;

            pricingData = getTokenData(
                TOKEN_ID
            );

            const merklePrice = pricingData.amount;
            debug("merklePrice", merklePrice);

            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                toWei("1"),
                toWei("1"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            //since 1 ETH corresponds to 10 USD in this test this amount should be allowed when converting in USD
            await expectRevert(
                router.borrowFunds(
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
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            )

            await router.borrowFunds(
                pool.address,
                merklePrice,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

        });

        it("USDC pool merkle price right converted (collfactor 60%)", async() => {

            const ETH_USD = 10;
            const COLL_FACTOR = 60;
            const HUNDRED = 100;
            const TOKEN_ID1 = 1;
            const TOKEN_ID2 = 2;

            pricingData = await getTokenData(
                TOKEN_ID1
            );

            pricingDataSecond = await getTokenData(
                TOKEN_ID2
            );

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                toWei("1"),
                toWei("0.6"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            const merklePrice = pricingData.amount;

            debug("merklePrice", merklePrice);

            await router.depositFunds(
                tokens(10000),
                pool.address,
                {
                    from: alice
                }
            );

            // Since converting with ETH price of 10 USD this borrow in
            // terms of USDC token should go through cause merkle price is
            // 250 ETH and collfactor 60%

            const maxBorrow = Bn(ETH_USD)
                .mul(Bn(pricingDataSecond.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED));

            debug("maxBorrow", maxBorrow);

            const littleLess = Bn(maxBorrow)
                .sub(Bn(toWei("0.000000000000001")));

            debug("littleless", littleLess);

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
                littleLess,
                nft.address,
                TOKEN_ID1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            //since 1 ETH corresponds to 10 USD in this test this amount should
            // be not allowed when converting in USD
            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    tokens(2501),
                    nft.address,
                    TOKEN_ID2,
                    pricingDataSecond.index,
                    pricingDataSecond.amount,
                    pricingDataSecond.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            )
        });

        it("USDC pool merkle price reacts smoothly to ETH price changes (collfactor 75%)", async() => {

            const ETH_USD = 10;
            const ETH_USD_NEW = 20;
            const COLL_FACTOR = 75;
            const HUNDRED = 100;
            const TOKEN_ID1 = 1;
            const TOKEN_ID2 = 2;

            // starting price 10 USD for ETH
            pricingData = await getTokenData(
                TOKEN_ID1
            );

            pricingDataSecond = await getTokenData(
                TOKEN_ID2
            );

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                toWei("1"),
                toWei("0.75"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            const maxBorrow = Bn(ETH_USD)
                .mul(Bn(pricingData.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED));

            const littleMore = Bn(maxBorrow)
                .add(Bn(toWei("0.000000000000001")));

            debug("maxBorrow", maxBorrow);
            debug("littleMore", littleMore);

            await router.depositFunds(
                tokens(10000),
                pool.address,
                {
                    from: alice
                }
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
                    littleMore,
                    nft.address,
                    TOKEN_ID1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            )

             // swichting price to 20 USD for ETH
            await chainlinkETH.setUSDValue(
                toWei(ETH_USD_NEW.toString())
            );

            // now little more should be okay becaused NFT has twice value and borrow amount
            // in USDC is the same.
            await router.borrowFunds(
                pool.address,
                littleMore,
                nft.address,
                TOKEN_ID1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            // Take out markov mean to simplify
            await pool.setMarkovMean(0);

            // borrow with second NFT and adjusted prices.
            // Not work again cause a little bit too much.
            const maxBorrowSecond = Bn(ETH_USD_NEW)
                .mul(Bn(pricingDataSecond.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED));

            const littleMoreTwo = Bn(maxBorrowSecond)
            .add(Bn(toWei("0.00000001")));

            debug("maxBorrowSecond", maxBorrow);
            debug("littleMoreTwo", littleMoreTwo);

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    littleMoreTwo,
                    nft.address,
                    TOKEN_ID2,
                    pricingDataSecond.index,
                    pricingDataSecond.amount,
                    pricingDataSecond.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            //but little bit less is okay
            const littleLessTwo = Bn(maxBorrowSecond)
                .sub(Bn(toWei("0.000000000000001")));

            router.borrowFunds(
                pool.address,
                littleLessTwo,
                nft.address,
                TOKEN_ID2,
                pricingDataSecond.index,
                pricingDataSecond.amount,
                pricingDataSecond.proof,
                {
                    from: bob
                }
            );
        });

        it("USDC pool merkle price reacts smoothly to USDC price changes (collfactor 75%)", async() => {

            const ETH_USD = 10;
            const USDC_USD = 1;
            const USDC_USD_NEW = 2;
            const COLL_FACTOR = 75;
            const HUNDRED = 100;

            const TOKEN_ID1 = 1;
            const TOKEN_ID2 = 2;

            const shortTime = 100;

            // starting price 1 USD for USDC
            pricingData = await getTokenData(
                TOKEN_ID1
            );

            pricingDataSecond = await getTokenData(
                TOKEN_ID2
            );

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                toWei("1"),
                toWei("0.75"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            await router.depositFunds(
                tokens(10000),
                pool.address,
                {
                    from: alice
                }
            );

            const maxBorrow = Bn(ETH_USD)
                .mul(Bn(pricingData.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED))
                .div(BN(USDC_USD));

            const littleLess = Bn(maxBorrow)
                .sub(Bn(toWei("0.000000000000001")));

                const currentStamp = await chainlinkUSDC.getTimeStamp();

                await chainlinkUSDC.setlastUpdateGlobal(
                    currentStamp
                );

                await chainlinkETH.setlastUpdateGlobal(
                    currentStamp
                );

                const smallTime = 10;
                await time.increase(smallTime);

            // Since USDC is 1 USD value this borrow should go through. Cause the ETH USD value is equal the token amount
            await router.borrowFunds(
                pool.address,
                littleLess,
                nft.address,
                TOKEN_ID1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            // Take out markov mean to simplify
            await pool.setMarkovMean(0);

            await chainlinkUSDC.setUSDValue(
                toWei(USDC_USD_NEW.toString())
            );

            // Now changing USD value of USDC to two and try to borrow
            // same amount of token which now would be twice in value -> should fail!
            const maxBorrowFail = Bn(ETH_USD)
                .mul(Bn(pricingDataSecond.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED))
                .div(BN(USDC_USD));

            const littleLessFail = Bn(maxBorrowFail)
                .sub(Bn(toWei("0.000000000000001")));

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    littleLessFail,
                    nft.address,
                    TOKEN_ID2,
                    pricingDataSecond.index,
                    pricingDataSecond.amount,
                    pricingDataSecond.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            // Now changing USD value of USDC to two and try to borrow
            // adjusted amount of token which now should pass!
            const maxBorrowPass = Bn(ETH_USD)
                .mul(Bn(pricingDataSecond.amount))
                .mul(Bn(COLL_FACTOR))
                .div(BN(HUNDRED))
                .div(BN(USDC_USD_NEW));

            const littleLessPass = Bn(maxBorrowPass)
                .sub(Bn(toWei("0.000000000000001")));

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

            const currentStampNew = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampNew
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampNew
            );

            await expectRevert.unspecified(
                router.borrowFunds(
                    pool.address,
                    littleLessPass,
                    nft.address,
                    TOKEN_ID2,
                    pricingDataSecond.index,
                    pricingDataSecond.amount,
                    pricingDataSecond.proof,
                    {
                         from: bob
                    }
                )
            );

            const timestampHeartbeatTest = await pool.getTimeStamp();

            await time.increase(shortTime);

            await chainlinkUSDC.setlastUpdateGlobal(
                timestampHeartbeatTest
            );

            await chainlinkETH.setlastUpdateGlobal(
                timestampHeartbeatTest
            );

            await router.borrowFunds(
                pool.address,
                littleLessPass,
                nft.address,
                TOKEN_ID2,
                pricingDataSecond.index,
                pricingDataSecond.amount,
                pricingDataSecond.proof,
                {
                     from: bob
                }
            );

            await expectRevert.unspecified(
                router.borrowMoreFunds(
                    pool.address,
                    littleLessPass,
                    nft.address,
                    TOKEN_ID2,
                    pricingDataSecond.index,
                    pricingDataSecond.amount,
                    pricingDataSecond.proof,
                    {
                        from: bob
                    }
                )
            );
        });
    });

})
