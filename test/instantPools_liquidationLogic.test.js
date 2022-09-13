const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink")

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow, tokensPlusDust } = require('./utils');

const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;

const debugFlag = true;

require("./constants");
require("./utils");

const data = require("./data.js").data;

const debug = (message1, message2) => {
    if (debugFlag) {
        console.log(
            `${message1}: ${message2.toString()}`
        );
    }
}

const debugSingle = (message) =>{
    if (debugFlag) {
        console.log(
            message
        );
    }
}

Contract.setProvider("ws://localhost:9545");

contract("instantPools", async accounts => {

    const [owner, alice, bob, chad, multisig] = accounts;

    let token, pool, nft, initialTargetPool, routerAddress, router, factory;


    describe("Basic liquidation tests without bad debt", () => {

        beforeEach(async() => {

            const TOKEN_ID = 1;
            const ALICE_TOKEN_AMOUNT = 10000000;

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

            routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address,
                {
                    from: multisig
                }
            );

            initialTargetPool = await factory.defaultPoolTarget();

            assert.equal(
                initialTargetPool.toString(),
                testerPool.address.toString()
            );

            router = await LiquidRouter.at(
                routerAddress
            );

            const poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.5"), // max percentage per loan 0.5 -> 50%
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

            await token.mint(
                tokens(ALICE_TOKEN_AMOUNT),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(ALICE_TOKEN_AMOUNT),
                {
                    from: alice
                }
            );

            await nft.mint(
                {
                    from: alice
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID,
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

            await chainlinkUSDC.setGlobalAggregatorRoundId(
                aggregatorRoundMax
            );

            await chainlinkETH.setGlobalAggregatorRoundId(
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

                await chainlinkETH.setRoundData(
                    currentRoundId,
                    timedistances[i - 1]
                );
            }

            await router.recalibrate(
                chainlinkUSDC.address
            );

            await router.recalibrate(
                chainlinkETH.address
            );
        });

        it("All revert scenarios work as intended", async() =>{

            const HUGE_AMOUNT = 10000000000;
            const TOKEN_ID = 1;
            const smallTime = 10;
            const distantPast = 10000;

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

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                tokens(10),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            await time.increase(
                31 * SECONDS_IN_DAY + 1
            );

            await expectRevert(
                router.liquidateNFT(
                    pool.address,
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                'LiquidPool: TOO_EARLY'
            );

            await time.increase(
                11 * SECONDS_IN_DAY + 1
            );

            await router.depositFunds(
                tokens(0.01),
                poolAddress,
                {
                    from: alice
                }
            );

            await expectRevert(
                router.liquidateNFT(
                    pool.address,
                    nft.address,
                    TOKEN_ID,
                    pricingData.index,
                    pricingData.amount,
                    ["0x0"],
                ),
                "LiquidPool: INVALID_PROOF"
            );

            await chainlinkETH.setlastUpdateGlobal(
                distantPast
            );

            await chainlinkUSDC.setlastUpdateGlobal(
                distantPast
            );


            await expectRevert(
                router.liquidateNFT(
                    pool.address,
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


            let currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            )
        //    let output = await pastEvents(pool.address,"LiquidateNFTEvent",0,10000);
        //    console.log(output);
        });

        it("LiquidateNFT sends NFT correclty ", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                tokens(10),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
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

            NFTadd = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTadd,
                pool.address
            );

            await time.increase(
                43 * SECONDS_IN_DAY + 1
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            )

            NFTadd2 = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTadd2,
                bob
            )
        });

        it("Loan gets deleted correctly after liquidation", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;

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

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                tokens(100),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            aliceLoan = await pool.currentLoans(
                nft.address,
                "1"
            );

            assert.isAbove(
                parseInt(aliceLoan.borrowShares),
                parseInt(0)
            );

            assert.equal(
                aliceLoan.tokenOwner,
                alice
            );

            await time.increase(
                35 * SECONDS_IN_DAY + 1
            );

            const currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            )

            aliceLoan2 = await pool.currentLoans(
                nft.address,
                "1"
            );

            assert.equal(
                aliceLoan2.borrowShares.toString(),
                "0"
            );

            assert.equal(
                aliceLoan2.tokenOwner,
                ZERO_ADDRESS
            );

            assert.equal(
                aliceLoan2.principalTokens.toString(),
                "0"
            );
        });

        it("Liquidation amounts get calculated correctly (USDC Pool)", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const timeInterval = 86400;
            const auctionTimeframe = 151200;
            const defaultTime = 36 * SECONDS_IN_DAY
            const loanInterval = 35 * SECONDS_IN_DAY;

            await token.mint(
                tokens(HUGE_AMOUNT),
                {
                    from: bob
                }
            );

            await token.approve(
                pool.address,
                tokens(HUGE_AMOUNT),
                {
                    from: bob
                }
            );

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                tokens(10),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            const startTime = await pool.getTimeStamp();

            const tokensPerLoan = await pool.merklePriceInPoolToken(
                pricingData.amount
            );

            debug("tokensPerLoan", tokensPerLoan);

            await time.increase(
                defaultTime
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            const endTime = await pool.getTimeStamp();

            const auctionPrice = await pool.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: chad
                }
            );

            debug("auctionPrice", auctionPrice);

            const diffTime = endTime
                .sub(startTime);

            debug("diffTime", diffTime);
            debug("defaultTime", defaultTime);

            const quotient = new BN(diffTime - loanInterval)
                .mul(new BN(toWei("1")))
                .div(new BN(auctionTimeframe));

            const factor = new BN(toWei("1"))
                .sub(new BN(toWei("0.5"))
                    .mul(quotient)
                    .div(new BN(toWei("1"))));


            const externaCalcPrice = new BN(tokensPerLoan)
                .mul(factor)
                .div(new BN(toWei("1")));

            debug("product", quotient);
            debug("factor", factor);
            debug("externaCalcPrice", externaCalcPrice);

            let val;

            if(auctionPrice > externaCalcPrice) {
                val = auctionPrice
                    .sub(externaCalcPrice);
            }
            else {
                val = externaCalcPrice
                    .sub(auctionPrice);
            }

            debug("val", val);

            assert.isAbove(
                parseInt(10),
                parseInt(val)
            );

            await time.increase(
                2 * SECONDS_IN_DAY
            );

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            const auctionPriceTwo = await pool.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: chad
                }
            );

            const halfPrice = new BN(toWei("0.5"))
                .mul(new BN(tokensPerLoan))
                .div(new BN(toWei("1")));

            assert.equal(
                auctionPriceTwo.toString(),
                halfPrice.toString(),   // increasse by one due to rounding mistakea
            );
        });

        it("Liquidation amounts get calculated correctly (ETH Pool)", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const auctionTimeframe = 151200;
            const halfDay = 43200;
            const defaultTime = 35 * SECONDS_IN_DAY + halfDay
            const loanInterval = 35 * SECONDS_IN_DAY;

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                web3.utils.toWei("1"),
                toWei("0.5"), // max percentage per loan 0.5 -> 50%
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

            await router.depositFunds(
                tokens(1000),
                poolAddressTwo,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddressTwo,
                tokens(50),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            const startTime = await poolTwo.getTimeStamp();

            const tokensPerLoan = await poolTwo.merklePriceInPoolToken(
                pricingData.amount
            );

            debug("tokensPerLoan", tokensPerLoan);

            await time.increase(
                defaultTime
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            const endTime = await poolTwo.getTimeStamp();

            const auctionPrice = await poolTwo.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: chad
                }
            );

            const diffTime = endTime
                .sub(startTime);

            debug("diffTime", diffTime);
            debug("defaultTime", defaultTime);

            const quotient = new BN(diffTime - loanInterval)
                .mul(new BN(toWei("1")))
                .div(new BN(auctionTimeframe));

            const factor = new BN(toWei("1"))
                .sub(new BN(toWei("0.5"))
                    .mul(quotient)
                    .div(new BN(toWei("1"))));


            const externaCalcPrice = new BN(tokensPerLoan)
                .mul(factor)
                .div(new BN(toWei("1")));

            debug("quotient", quotient);
            debug("product", quotient);
            debug("factor", factor);
            debug("externaCalcPrice", externaCalcPrice);
            debug("auctionPrice", auctionPrice);

            let val;

            if(auctionPrice > externaCalcPrice) {
                val = auctionPrice
                    .sub(externaCalcPrice);
            }
            else {
                val = externaCalcPrice
                    .sub(auctionPrice);
            }

            debug("val", val);

            assert.isAbove(
                parseInt(10),
                parseInt(val)
            );

            await time.increase(
                2 * SECONDS_IN_DAY
            );

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            const auctionPriceTwo = await poolTwo.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: chad
                }
            );

            const halfPrice = new BN(toWei("0.5"))
                .mul(new BN(tokensPerLoan))
                .div(new BN(toWei("1")));

            assert.equal(
                auctionPriceTwo.toString(),
                halfPrice.toString(),   // increasse by one due to rounding mistakea
            );

        });

        it("Pool variables get updated correctly after liquidation", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;

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

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                tokens(100),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            NFTadd = await nft.ownerOf(
                TOKEN_ID
            );

            const rate = await pool.borrowRate();
            const utilization = await pool.utilisationRate();

            debug("utilization", utilization);
            debug("rate", rate);

            assert.equal(
                NFTadd,
                pool.address
            );

            await time.increase(
                36 * SECONDS_IN_DAY
            );

            let currentStamp = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStamp
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStamp
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const rateAfter = await pool.borrowRate();
            const utilisationAfter = await pool.utilisationRate();
            const totalTokensDue = await pool.totalTokensDue();
            const poolToken = await pool.poolToken();
            const poolShares = await pool.totalBorrowShares();

            debug("utilisationAfter", utilisationAfter);
            debug("rateAfter", rateAfter);

            NFTadd2 = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTadd2,
                bob
            );

            assert.equal(
                poolShares.toString(),
                "0"
            );


            assert.equal(
                totalTokensDue.toString(),
                "0"
            );

            assert.isAbove(
                parseInt(utilization),
                parseInt(utilisationAfter)
            );

            assert.isAbove(
                parseInt(rate),
                parseInt(rateAfter)
            );

            assert.isAbove(
                parseInt(poolToken),
                parseInt(tokens(1000))
            );
        });

        it("Overhang is treated correctly with no bad debt", async() => {

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const timeInterval = 43200;
            const borrowAmount = "500";
            const defaultTime = 35 * SECONDS_IN_DAY + timeInterval;
            const oneYear = 31449600;

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

            await router.depositFunds(
                tokens(1000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            const timeOne = await pool.getTimeStamp();

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            const borrowRate = await pool.borrowRate();

            const tokensDue = await pool.totalTokensDue();

            debug("tokensDue", tokensDue);

            await time.increase(
                defaultTime
            );

            const bobBefore = await token.balanceOf(
                bob
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            const timeTwo = await pool.getTimeStamp();

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const bobAfter = await token.balanceOf(
                bob
            );

            const timediff = timeTwo
                .sub(timeOne);

            const interest = tokensDue
                .mul(borrowRate)
                .mul(timediff)
                .div(new BN(oneYear))
                .div(new BN(toWei("1")));

            const paybackAmount = interest
                .add(new BN(toWei(borrowAmount)));

            const diff = bobBefore
                .sub(bobAfter);

            const overhang = diff
                .sub(paybackAmount);

            debug("diff", diff);
            debug("overhang", overhang);

            const routerone = await token.balanceOf(
                router.address
            );

            debug("routerone", routerone);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const routerTwo = await token.balanceOf(
                router.address
            );

            const quotient = routerTwo
                .mul(new BN(toWei("1")))
                .div(overhang);

            debug("quotient", quotient);

            debug("routerTwo", routerTwo);

            assert(
                comparingTwoNumbers(
                    routerTwo,
                    overhang,
                    "0.0001",
                    true
                )
            );
        });
    });

    describe("Bad debt tests", () => {

        beforeEach(async() => {

            const TOKEN_ID = 1;
            const ALICE_TOKEN_AMOUNT = 10000000;

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

            routerAddress = await factory.routerAddress();

            testerPool = await LiquidPoolTester.new();

            await factory.updateDefaultPoolTarget(
                testerPool.address,
                {
                    from: multisig
                }
            );

            initialTargetPool = await factory.defaultPoolTarget();

            assert.equal(
                initialTargetPool.toString(),
                testerPool.address.toString()
            );

            router = await LiquidRouter.at(
                routerAddress
            );

            const poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.75"), // max percentage per loan 0.75 -> 75%
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

            await token.mint(
                tokens(ALICE_TOKEN_AMOUNT),
                {
                    from: alice
                }
            );

            await token.approve(
                router.address,
                tokens(ALICE_TOKEN_AMOUNT),
                {
                    from: alice
                }
            );

            await nft.mint(
                {
                    from: alice
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID,
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

        it("Bad debt gets treated correclty", async() =>{

            const TOKEN_ID = 1;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const borrowAmount = "1870";
            const defaultTime = 37 * SECONDS_IN_DAY;
            const oneYear = 31449600;

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

            await router.depositFunds(
                tokens(10000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            const timeOne = await pool.getTimeStamp();

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            const borrowRate = await pool.borrowRate();
            const tokensDue = await pool.totalTokensDue();

            debug("tokensDue", tokensDue);

            await time.increase(defaultTime);

            const badDebtBefore = await pool.badDebt();
            const totalPoolBefore = await pool.totalPool();

            assert.equal(
                badDebtBefore.toString(),
                "0"
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            const auctionPrice = await pool.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: chad
                }
            );

            const timeTwo = await pool.getTimeStamp();

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const timediff = timeTwo
                .sub(timeOne);

            const interest = tokensDue
                .mul(borrowRate)
                .mul(timediff)
                .div(new BN(oneYear))
                .div(new BN(toWei("1")));

            const loanAmount = interest
                .add(new BN(toWei(borrowAmount)));

            const badDebtCalc = loanAmount
                .sub(auctionPrice);

            const badDebtAfter = await pool.badDebt();

            debug("badDebtCalc", badDebtCalc);
            debug("badDebtAfter", badDebtAfter);

            assert(
                comparingTwoNumbers(
                    badDebtAfter,
                    badDebtCalc,
                    "0.0001",
                    true
                )
            );

            const totalPoolAfter = await pool.totalPool();

            const diffPool = totalPoolAfter
                .sub(totalPoolBefore);

            debug("diffPool", diffPool);
            debug("auctionPrice", auctionPrice);

            assert.equal(
                diffPool.toString(),
                auctionPrice.toString()
            );
        });

        it("Bad debt gets reduced correclty by overhang", async() => {

            const TOKEN_ID = 1;
            const TOKEN_ID2 = 2;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const borrowAmount = "1870";
            const secondBorrowAmount = "1500";
            const defaultTime = 37 * SECONDS_IN_DAY;
            const defaultTime2 = 36 * SECONDS_IN_DAY;
            const oneYear = 31449600;

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID2,
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

            await router.depositFunds(
                tokens(10000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const pricingData2 = getTokenData(
                TOKEN_ID2
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            await time.increase(defaultTime);

            const badDebtBefore = await pool.badDebt();

            assert.equal(
                badDebtBefore.toString(),
                "0"
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const NFTLiq = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTLiq,
                bob
            );

            const badDebt = await pool.badDebt();
            debug("badDebt", badDebt);

            const timeOne = await pool.getTimeStamp();

            await router.borrowFunds(
                poolAddress,
                toWei(secondBorrowAmount),
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const borrowRate = await pool.borrowRate();
            const tokensDue = await pool.totalTokensDue();
            const fee = await pool.fee();

            await time.increase(defaultTime2);

            const bobBefore = await token.balanceOf(
                bob
            );

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            const timeTwo = await pool.getTimeStamp();

            const balRouter1 = await token.balanceOf(
                router.address
            );

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            const balRouter2 = await token.balanceOf(
                router.address
            );

            assert.equal(
                balRouter1.toString(),
                balRouter2.toString()
            );

            const bobAfter = await token.balanceOf(
                bob
            );

            const badDebtAfter = await pool.badDebt();

            const NFTLiq2 = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTLiq2,
                bob
            );

            const timediff = timeTwo
                .sub(timeOne);

            const interest = tokensDue
                .mul(borrowRate)
                .mul(timediff)
                .div(new BN(oneYear))
                .div(new BN(toWei("1")));

            const feePortion = Bn(interest)
            .mul(fee)
            .div(Bn(toWei("1")));

            debug("feePortion", feePortion);

            const paybackAmount = interest
                .add(new BN(toWei(secondBorrowAmount)));

            const diff = bobBefore
                .sub(bobAfter);

            const overhang = diff
                .sub(paybackAmount);

            const diffBadDebt = badDebt
                .sub(badDebtAfter);

            const overhangPlusFee = overhang
                .add(feePortion);

            debug("overhangPlusFee", overhangPlusFee);
            debug("diffBadDebt", diffBadDebt);

            assert(
                    comparingTwoNumbers(
                    overhangPlusFee,
                    diffBadDebt,
                    "0.001",
                    true
                )
            );

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: bob
                }
            );

            const balRouter3 = await token.balanceOf(
                router.address
            );

            assert.equal(
                balRouter3.toString(),
                balRouter2.toString()
            );
        });

        it("When bad debt is fully reduced rest goes to router", async() => {

            const TOKEN_ID = 1;
            const TOKEN_ID2 = 2;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const borrowAmount = "1870";
            const secondBorrowAmount = "500";
            const defaultTime = 37 * SECONDS_IN_DAY;
            const defaultTime2 = 36 * SECONDS_IN_DAY;
            const oneYear = 31449600;

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID2,
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

            await router.depositFunds(
                tokens(10000),
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const pricingData2 = getTokenData(
                TOKEN_ID2
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            await time.increase(defaultTime);

            const badDebtBefore = await pool.badDebt();

            assert.equal(
                badDebtBefore.toString(),
                "0"
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const NFTLiq = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTLiq,
                bob
            );

            const badDebt = await pool.badDebt();

            const timeOne = await pool.getTimeStamp();

            await router.borrowFunds(
                poolAddress,
                toWei(secondBorrowAmount),
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const borrowRate = await pool.borrowRate();
            const tokensDue = await pool.totalTokensDue();
            const fee = await pool.fee();

            await time.increase(defaultTime2);

            const bobBefore = await token.balanceOf(
                bob
            );

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            const timeTwo = await pool.getTimeStamp();

            const balRouter1 = await token.balanceOf(
                router.address
            );

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            const balRouter2 = await token.balanceOf(
                router.address
            );

            assert.equal(
                balRouter1.toString(),
                balRouter2.toString()
            );

            const bobAfter = await token.balanceOf(
                bob
            );

            const badDebtAfter = await pool.badDebt();

            assert.equal(
                badDebtAfter.toString(),
                "0"
            );

            const NFTLiq2 = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTLiq2,
                bob
            );

            const timediff = timeTwo
                .sub(timeOne);

            const interest = tokensDue
                .mul(borrowRate)
                .mul(timediff)
                .div(new BN(oneYear))
                .div(new BN(toWei("1")));

            const feePortion = Bn(interest)
            .mul(fee)
            .div(Bn(toWei("1")));

            debug("feePortion", feePortion);

            const paybackAmount = interest
                .add(new BN(toWei(secondBorrowAmount)));

            const diff = bobBefore
                .sub(bobAfter);

            const overhang = diff
                .sub(paybackAmount);

            const overhangPlusFee = overhang
                .add(feePortion);

            const restEarnings = overhang
                .sub(badDebt)
                .add(feePortion)

            debug("overhangPlusFee", overhangPlusFee);
            debug("badDebt", badDebt);
            debug("restEarnings", restEarnings);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: bob
                }
            );

            const balRouter3 = await token.balanceOf(
                router.address
            );

            debug("balRouter3", balRouter3);

            assert(
                comparingTwoNumbers(
                    balRouter3,
                    restEarnings,
                    "0.00001",
                    true
                )
            );
        });

        it("Share allocation works correctly with bad debt within a full life-cyle", async() => {

            const TOKEN_ID = 1;
            const TOKEN_ID2 = 2;
            const TOKEN_ID3 = 3;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const borrowAmount = "1870";
            const secondBorrowAmount = "1310";
            const thirdBOrrowAmount = "1870";
            const littleMoreThanBorrowed = "1880";
            const halfDay = 64800;
            const defaultTime = 37 * SECONDS_IN_DAY;
            const defaultTime2 = 35 * SECONDS_IN_DAY + halfDay;
            const longBorrowTime = 40 * SECONDS_IN_DAY

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID2,
                {
                    from: chad
                }
            );

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID3,
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
                poolAddress,
                {
                    from: alice
                }
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const pricingData2 = getTokenData(
                TOKEN_ID2
            );

            const pricingData3 = getTokenData(
                TOKEN_ID3
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            await time.increase(defaultTime);

            const badDebtBefore = await pool.badDebt();

            assert.equal(
                badDebtBefore.toString(),
                "0"
            );

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            const shareRouter1 = await pool.internalShares(
                router.address
            );

            const diff1 = await pool.differencePseudo();
            debug("diff1",diff1);

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const shareRouter2 = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(shareRouter2),
                parseInt(shareRouter1)
            );

            const NFTLiq = await nft.ownerOf(
                TOKEN_ID
            );

            assert.equal(
                NFTLiq,
                bob
            );

            const diff2 = await pool.differencePseudo();
            debug("diff2",diff2);

            await router.borrowFunds(
                poolAddress,
                toWei(secondBorrowAmount),
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const shareRouter3 = await pool.internalShares(
                router.address
            );

            const balRouter1 = await token.balanceOf(
                router.address
            );

            assert.equal(
                balRouter1.toString(),
                "0"
            );

            assert.equal(
                shareRouter3.toString(),
                shareRouter2.toString()
            )

            await time.increase(defaultTime2);

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            const auctionPrice = await pool.getCurrentAuctionPrice(
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const beforeBadDebt = await pool.badDebt();

            debug("auctionPrice", auctionPrice);
            debug("beforeBadDebt", beforeBadDebt);

            const diff3 = await pool.differencePseudo();
            debug("diff3",diff3);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: bob
                }
            );

            const balRouter2 = await token.balanceOf(
                router.address
            );

            const shareRouter4 = await pool.internalShares(
                router.address
            );

            assert.equal(
                balRouter2.toString(),
                balRouter1.toString()
            )

            assert.equal(
                shareRouter3.toString(),
                shareRouter4.toString()
            )

            await router.borrowFunds(
                poolAddress,
                toWei(thirdBOrrowAmount),
                nft.address,
                TOKEN_ID3,
                pricingData3.index,
                pricingData3.amount,
                pricingData3.proof,
                {
                    from: chad
                }
            );

            const restBadDebt = await pool.badDebt();
            debug("restBadDebt", restBadDebt);

            await time.increase(longBorrowTime);

            const currentStampFour = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampFour
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampFour
            );

            await time.increase(smallTime);

            await router.paybackFunds(
                poolAddress,
                toWei(littleMoreThanBorrowed),
                nft.address,
                TOKEN_ID3,
                pricingData3.index,
                pricingData3.amount,
                pricingData3.proof,
                {
                    from: chad
                }
            )

            const diff = await pool.differencePseudo();
            debug("diff",diff);

            const tokenDue = await pool.totalTokensDue()
            debug("tokenDue", tokenDue);

            const loanData = await pool.currentLoans(
                nft.address,
                TOKEN_ID3
            );

            const owner = loanData.tokenOwner;
            debug("owner",owner);

            assert.equal(
                owner,
                ZERO_ADDRESS
            );

            const lastBadDebt = await pool.badDebt();
            debug("lastBadDebt", lastBadDebt);

            assert.equal(
                lastBadDebt.toString(),
                "0"
            );

            const borrowRate = await pool.borrowRate();
            debug("borrowRate", borrowRate);

            const shareAlice = await pool.internalShares(
                alice
            );

            await router.withdrawFunds(
                shareAlice,
                pool.address,
                {
                    from: alice
                }
            );

            const shareRouter5 = await pool.internalShares(
                router.address
            );

            await router.withdrawFees(
                [pool.address],
                [shareRouter5],
                {
                    from: multisig
                }
            );

            const restBal = await pool.totalPool();
            debug("restBal", restBal);
            const sharesEnd = await pool.totalInternalShares();
            debug("sharesEnd", sharesEnd);
            const pseudoEnd = await pool.pseudoTotalTokensHeld();
            debug("pseudoEnd", pseudoEnd);
            const tokenDueEnd = await pool.totalTokensDue();
            debug("tokenDueEnd", tokenDueEnd);
            const borrowSharesEnd = await pool.totalBorrowShares();
            debug("borrowSharesEnd", borrowSharesEnd);
            const totPoolEnd = await pool.totalPool();
            debug("totPoolEnd", totPoolEnd);
            const utiEnd = await pool.utilisationRate();
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
                restBal.toString(),
                "1"
            );

        });

        it("Reduce bad debt with fees works correctly", async() => {

            const TOKEN_ID = 1;
            const TOKEN_ID2 = 2;
            const TOKEN_ID3 = 3;
            const HUGE_AMOUNT = 10000000000;
            const smallTime = 10;
            const borrowAmount = "1870";
            const secondBorrowAmount = "1310";
            const thirdBOrrowAmount = "1870";
            const littleMoreThanBorrowed = "1880";
            const halfDay = 64800;
            const fiveDays = 5 * SECONDS_IN_DAY;
            const tenDays = 10 * SECONDS_IN_DAY;
            const thirdyDays = 30 * SECONDS_IN_DAY;
            const defaultTime = 30 * SECONDS_IN_DAY + 0.75 * halfDay;
            const defaultTime2 = 35 * SECONDS_IN_DAY + halfDay;
            const longBorrowTime = 40 * SECONDS_IN_DAY

            await nft.mint(
                {
                    from: chad
                }
            );

            await nft.approve(
                router.address,
                TOKEN_ID2,
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
                tokens(3500),
                poolAddress,
                {
                    from: alice
                }
            );

            const shareRouter1 = await pool.internalShares(
                router.address
            );

            assert.equal(
                shareRouter1.toString(),
                "0"
            );

            const pricingData = getTokenData(
                TOKEN_ID
            );

            const pricingData2 = getTokenData(
                TOKEN_ID2
            );

            const currentStampOne = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampOne
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampOne
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                toWei(borrowAmount),
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: alice
                }
            );

            const shareRouter2 = await pool.internalShares(
                router.address
            );

            assert.equal(
                shareRouter2.toString(),
                "0"
            );

            const badDebt1 = await pool.badDebt();
            const diff1 = await pool.differencePseudo();

            debug("bad debt start", badDebt1)
            debug("diff start ohne BD", diff1);

            await time.increase(fiveDays);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const shareRouter3 = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(shareRouter3),
                parseInt(shareRouter2)
            );

            const badDebt2 = await pool.badDebt();
            const diff2 = await pool.differencePseudo();

            debug("BD nach trigger deposit", badDebt2)
            debug("diff ohne BD nach trigger deposit", diff2);

            const currentStampTwo = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampTwo
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampTwo
            );

            await time.increase(smallTime);

            await router.borrowFunds(
                poolAddress,
                toWei(secondBorrowAmount),
                nft.address,
                TOKEN_ID2,
                pricingData2.index,
                pricingData2.amount,
                pricingData2.proof,
                {
                    from: chad
                }
            );

            const shareRouter4 = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(shareRouter4),
                parseInt(shareRouter3)
            );

            const badDebt3 = await pool.badDebt();
            const diff3 = await pool.differencePseudo();

            debug("BD nach zweiten borrow", badDebt3)
            debug("diff ohne BD nach zweiten borrow", diff3);

            await time.increase(defaultTime);

            const currentStampThree = await chainlinkUSDC.getTimeStamp();

            await chainlinkUSDC.setlastUpdateGlobal(
                currentStampThree
            );

            await chainlinkETH.setlastUpdateGlobal(
                currentStampThree
            );

            await time.increase(smallTime);

            await router.liquidateNFT(
                pool.address,
                nft.address,
                TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const shareRouter5 = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(shareRouter5),
                parseInt(shareRouter4)
            );

            const badDebt4 = await pool.badDebt();
            const diff4 = await pool.differencePseudo();

            debug("BD nach liquidate mit BD", badDebt4)
            debug("diff nach liquidate mit BD", diff4);

            await router.withdra

            await time.increase(2 * thirdyDays);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const shareRouter6 = await pool.internalShares(
                router.address
            );

            assert.equal(
                shareRouter6.toString(),
                shareRouter5.toString()
            );

            const badDebt5 = await pool.badDebt();
            const diff5 = await pool.differencePseudo();

            debug("BD nach erstem trigger deposit mit BD", badDebt5)
            debug("diff nach erstem trigger deposit mit BD", diff5);

            await time.increase(2 * thirdyDays);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const shareRouter7 = await pool.internalShares(
                router.address
            );

            assert.equal(
                shareRouter7.toString(),
                shareRouter6.toString()
            );

            const badDebt6 = await pool.badDebt();
            const diff6 = await pool.differencePseudo();

            debug("BD nach zweitem trigger deposit mit BD", badDebt6)
            debug("diff nach zweitem trigger deposit mit BD", diff6);

            await time.increase(2 * thirdyDays);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const shareRouter8 = await pool.internalShares(
                router.address
            );

            assert.equal(
                shareRouter8.toString(),
                shareRouter7.toString()
            );

            const badDebt7 = await pool.badDebt();
            const diff7 = await pool.differencePseudo();

            debug("BD nach dritten trigger deposit mit BD", badDebt7)
            debug("diff nach dritten trigger deposit mit BD", diff7);

            await time.increase(thirdyDays);

            await router.depositFunds(
                tokens(1),
                poolAddress,
                {
                    from: alice
                }
            );

            const badDebt8 = await pool.badDebt();
            const diff8 = await pool.differencePseudo();

            debug("BD nach vierter trigger deposit mit BD", badDebt8)
            debug("diff nach vierter trigger deposit mit BD", diff8);

            const shareRouter9 = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(shareRouter9),
                parseInt(shareRouter8)
            );
        });
    });
})
