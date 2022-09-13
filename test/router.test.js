const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect } = require('chai');
const Contract = require('web3-eth-contract');

require('./utils');
require("./constants");
const data = require("./data.js").data;

const fromWei = web3.utils.fromWei;
const toWei = web3.utils.toWei;

const DUMMY_ADDRESS1 = "0x5866e7451Cdd287a2375eFB669DB69398836A0E3";
const DUMMY_ADDRESS2 = "0x2bfe110B0812D67b3f602D7c3B643b37Cb7B0FC9";

const SECONDS_IN_DAY = 86400;

Contract.setProvider("ws://localhost:9545");

const tokens = (value) => {
    return web3.utils.toWei(
        value.toString()
    );
}

const debugFlag = true;

const debug = (
    message1
) => {
    if (debugFlag) {
        console.log(
            `${message1}`
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

    let tokenETH, tokenUSDC, pool, poolCount, nft, factory, router, initialTargetPool,testerPool;

    describe("General Router Tests", () => {

        beforeEach(async () => {

            tokenETH = await ERC20.new(
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

            initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                tokenETH.address,
                chainlinkETH.address,
                toWei("2"),
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
                tokenETH.address,
                factory.address,
                initialTargetPool
            );

            pool = await LiquidPoolTester.at(poolAddress);

            await tokenETH.mint(
                tokens(1000),
                {
                    from: alice
                }
            );

            await tokenETH.approve(
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

        })

        it("Deposit from router", async () => {

            await router.depositFunds(
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            let shares = await pool.internalShares(
                alice
            );

            assert.equal(
                fromWei(
                    shares.toString()
                ),
                "25"
            );

            debug(fromWei(shares.toString()));

        });

        it("Withdraw from router", async () => {

            await router.depositFunds(
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(3 * 3600);

            await pool.tokeniseShares(
                toWei("10"),
                {
                    from: alice
                }
            );

            await expectRevert(
                router.withdrawFunds(
                    toWei("26"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "revert" //just revert because underflow
            );

            let depositTokenBal = await tokenETH.balanceOf(
                alice
            );

            debug("ALICEBAL : " + depositTokenBal.toString());

            await router.withdrawFunds(
                toWei("10"),
                pool.address,
                {
                    from: alice
                }
            );

            depositTokenBal = await tokenETH.balanceOf(
                alice
            );

            debug("ALICEBAL : " + depositTokenBal.toString());

            let internalShares = await pool.internalShares(
                alice
            );

            let tokenShares = await pool.balanceOf(
                alice
            );

            depositTokenBal = await tokenETH.balanceOf(
                alice
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "5"
            );

            assert.equal(
                fromWei(
                    tokenShares.toString()
                ),
                "10"
            );

            assert.equal(
                fromWei(
                    depositTokenBal.toString()
                ),
                "985"
            );
        });

        it("Borrow from router", async () => {

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
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            tokOwnerBefore = await nft.ownerOf(1);

            pricingData = getTokenData(
                TOKEN_ID
            );

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

            bobBal = await tokenETH.balanceOf(bob);

            assert.notEqual( bobBal, new BN('0') );
        });

        it("Payback from router", async () => {

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

            await tokenETH.mint(
                toWei("1000"),
                {
                    from: bob
                }
            );

            await tokenETH.approve(
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

            await time.increase(SECONDS_IN_DAY * 33);

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

            bobBal = await tokenETH.balanceOf(
                bob
            );
            debug(bobBal.toString());

            assert( closeToBn( bobBal, "100000000000000000000", "10000000" ));

        });
    });

    describe("Move Funds Tests", () => {

        beforeEach(async () => {

            tokenETH = await ERC20.new(
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

            initialTargetPool = await factory.defaultPoolTarget();

            router = await LiquidRouter.at(
                routerAddress
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                tokenETH.address,
                chainlinkETH.address,
                toWei("2"),
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
                tokenETH.address,
                factory.address,
                initialTargetPool
            );

            pool = await LiquidPoolTester.at(poolAddress);

            await tokenETH.mint(
                tokens(1000),
                {
                    from: alice
                }
            );

            await tokenETH.approve(
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

        })

        it("Basic move funds usage test", async () => {

            poolCount = await factory.poolCount();

            //80% pool instead of 50%
            await factory.createLiquidPool(
                tokenETH.address,
                chainlinkETH.address,
                toWei("1"),
                toWei("0.8"),
                [nft.address],
                "Pool Shares",
                "POOL",
            );

            poolAddress = await factory.predictPoolAddress(
                poolCount,
                tokenETH.address,
                factory.address,
                initialTargetPool
            );

            pool2 = await LiquidPoolTester.at(
                poolAddress
            );

            await tokenETH.mint(
                tokens(100),
                {
                    from: alice
                }
            );

            await tokenETH.approve(
                router.address,
                tokens(1000),
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

            aliceShares = await pool.internalShares(
                alice
            );

            debug(aliceShares.toString());

            aliceSharesN = await pool2.internalShares(
                alice
            );

            debug(aliceSharesN.toString());

            await time.increase(3 * 3600);

            await router.moveFunds(
                tokens(100),
                pool.address,
                pool2.address,
                {
                    from: alice
                }
            );

            aliceShares1 = await pool.internalShares(
                alice
            );

            debug("pool 1 and pool 2 shares after move");
            debug(aliceShares1.toString());

            aliceShares2 = await pool2.internalShares(
                alice
            );

            debug(aliceShares2.toString());

            assert.equal(
                fromWei(
                    aliceShares2.toString()
                ),
                "100"
            );
            assert.equal(
                fromWei(
                    aliceShares1.toString()
                ),
                "0"
            );
        });

        it("moveFunds between different poolTokens not possible", async () => {

            poolCount = await factory.poolCount();

            let tokenUSDC = await ERC20.new(
                    "Super Coin",
                    "USDC"
                );

            //80% pool instead of 50% USDC pool
            await factory.createLiquidPool(
                tokenUSDC.address,
                chainlinkUSDC.address,
                toWei("1"),
                toWei("0.8"),
                [nft.address],
                "Pool Shares",
                "POOL",
            );

            poolAddress = await factory.predictPoolAddress(
                poolCount,
                tokenUSDC.address,
                factory.address,
                initialTargetPool
            );

            pool2 = await LiquidPoolTester.at(
                poolAddress
            );

            await tokenUSDC.mint(
                toWei("100"),
                {
                    from: alice
                }
            );

            await tokenUSDC.approve(
                router.address,
                toWei("1000"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("100"),
                pool2.address,
                {
                    from: alice
                }
            );

            aliceShares = await pool.internalShares(
                alice
            );

            debug(aliceShares.toString());

            aliceSharesN = await pool2.internalShares(
                alice
            );

            debug(aliceSharesN.toString());

            await time.increase(3 * 3600);

            await expectRevert(router.moveFunds(
                toWei("100"),
                pool.address,
                pool2.address,
                {
                    from: alice
                }
            ),"LiquidRouter: TOKENS_MISMATCH");

            aliceShares1 = await pool.internalShares(
                alice
            );

            debug("pool 1 and pool 2 shares after move");
            debug(aliceShares1.toString());

            aliceShares2 = await pool2.internalShares(
                alice
            );

            debug(aliceShares2.toString());

            assert.equal(
                fromWei(
                    aliceShares2.toString()
                ),
                "100"
            );
            assert.equal(
                fromWei(
                    aliceShares1.toString()
                ),
                "0"
            );
        });
    });
});
