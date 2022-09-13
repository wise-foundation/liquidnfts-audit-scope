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

    const [owner, alice, bob,multisig] = accounts;

    let token, pool, nft, factory, router, pricingData,testerPool;

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
            toWei("2"),
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

    describe("Share System Tests", () => {

        it("Tokens taken and correct amount of shares issued on deposit", async() => {
            await token.mint(
                toWei("100"),
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

            await router.depositFunds(
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );
        });

        it("Tokenizing shares works correctly", async() => {
            await token.mint(
                toWei("100"),
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
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                3 * 3600
            );

            await expectRevert(
                pool.tokeniseShares(
                    toWei("26"),
                    {
                        from: alice
                    }
                ),
                "revert" //just revert because underflow
            );

            await pool.tokeniseShares(
                toWei("10"),
                {
                    from: alice
                }
            );

            const internalShares = await pool.internalShares(
                alice
            );

            const tokenShares = await pool.balanceOf(
                alice
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "15"
            );

            assert.equal(
                fromWei(
                    tokenShares.toString()
                ),
                "10"
            );
        });

        it("Withdraw from internal shares works ", async() => {

            await token.mint(
                toWei("100"),
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
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            /*
            await expectRevert(
                router.withdrawFunds(
                    toWei("15"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: TOO_SOON_AFTER_DEPOSIT" //just revert because underflow
            );
            */

            await time.increase(3 * 3600);

            await pool.tokeniseShares(
                toWei("10"),
                {
                    from: alice
                }
            );

            /*
            await expectRevert(
                router.withdrawFunds(
                    toWei("16"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "revert" //just revert because underflow
            );
            */

            let depositTokenBal = await token.balanceOf(
                alice
            );

            debug("ALICEBALAN : " + depositTokenBal.toString());

            let aliceInternal = await pool.internalShares(alice);

            debug("Alice Internal : " + aliceInternal.toString());

            let borrowRate = await pool.borrowRate();

            debug("borrowRate : " + borrowRate.toString());

            await router.withdrawFunds(
                toWei("15"),
                pool.address,
                {
                    from: alice
                }
            );

            depositTokenBal = await token.balanceOf(
                alice
            );

            debug("ALICEBALA : " + depositTokenBal.toString());

            let internalShares = await pool.internalShares(
                alice
            );

            let tokenShares = await pool.balanceOf(
                alice
            );

            depositTokenBal = await token.balanceOf(
                alice
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "0"
            );

            assert.equal(
                fromWei(
                    tokenShares.toString()
                ),
                "10"
            );

            assert(
                closeToBn(
                    depositTokenBal,
                    "90",
                    "10000000"
                )
            );
        });

        it("Withdraw from tokenized shares works correctly", async() => {

            await token.mint(
                toWei("100"),
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
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

    /*        await expectRevert(
                router.withdrawFunds(
                    toWei("15"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: TOO_SOON_AFTER_DEPOSIT" //just revert because underflow
            );
            */

            await time.increase(4 * 3600);

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


            let depositTokenBal = await token.balanceOf(
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

            depositTokenBal = await token.balanceOf(
                alice
            );

            debug("ALICEBAL : " + depositTokenBal.toString());

            let internalShares = await pool.internalShares(
                alice
            );

            let tokenShares = await pool.balanceOf(
                alice
            );

            depositTokenBal = await token.balanceOf(
                alice
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "5"
            );

            assert(
                closeToBn(
                    depositTokenBal,
                    "85",
                    "1"
                )
            );
        });

        it("Cannot withdraw larger share value than a user owns + smart withdraw takes from internal first", async() => {

            await token.mint(
                toWei("100"),
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
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );
/*
            await expectRevert(
                router.withdrawFunds(
                    toWei("15"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: TOO_SOON_AFTER_DEPOSIT" //just revert because underflow
            );
*/
            await time.increase(
                3 * 3600
            );

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

            let depositTokenBal = await token.balanceOf(
                alice
            );

            debug("ALICEBAL : " + depositTokenBal.toString());

            await expectRevert(
                router.withdrawFunds(
                    toWei("26"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "revert"
            );

            await expectRevert(
                pool.withdrawFunds(
                    toWei("11"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "revert"
            );

            await expectRevert(
                router.withdrawFunds(
                    toWei("26"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "revert"
            );

            await router.withdrawFunds(
                toWei("20"),
                pool.address,
                {
                    from: alice
                }
            );

            depositTokenBal = await token.balanceOf(
                alice
            );

            debug("ALICEBAL : " + depositTokenBal.toString());

            let internalShares = await pool.internalShares(
                alice
            );

            let tokenShares = await pool.balanceOf(
                alice
            );

            depositTokenBal = await token.balanceOf(
                alice
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "0"
            );
            assert(
                closeToBn(
                    tokenShares,
                    "5",
                    "1"
                )
            );

            assert(
                closeToBn(
                    depositTokenBal,
                    "95",
                    "1"
                )
            );
        });

        //two parts to this test, make sure original depositor can only withdraw equal to shares he now owns,
        //and 2. new receiver of shares can withdraw even if they never deposited
        it("Withdraw works correctly even after share transfer", async() => {

            await token.mint(
                toWei("100"),
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
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );
/*
            await expectRevert(
                router.withdrawFunds(
                    toWei("15"),
                    pool.address,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: TOO_SOON_AFTER_DEPOSIT" //just revert because underflow
            );
*/
            await time.increase(
                3 * 3600
            );

            await pool.tokeniseShares(
                toWei("10"),
                {
                    from: alice
                }
            );

            await pool.transfer(
                bob,
                toWei("6"),
                {
                    from: alice
                }
            );

            await router.withdrawFunds(
                toWei("5"),
                pool.address,
                {
                    from: bob
                }
            );

            const internalShares = await pool.internalShares(
                alice
            );

            const tokenShares = await pool.balanceOf(
                alice
            );

            const tokenSharesBob = await pool.balanceOf(
                bob
            );

            const depositTokenBalBob = await token.balanceOf(
                bob
            );

            assert.equal(
                fromWei(
                    internalShares.toString()
                ),
                "15"
            );

            assert.equal(
                fromWei(
                    tokenShares.toString()
                ),
                "4"
            );

            assert.equal(
                fromWei(
                    tokenSharesBob.toString()
                ),
                "1"
            );

            assert(
                closeToBn(
                    depositTokenBalBob,
                    "5",
                    "1"
                ),
                true
            );
        });
    });
});
