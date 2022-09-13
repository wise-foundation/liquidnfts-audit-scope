const LiquidPoolTester = artifacts.require("TesterPool");
const Chainlink = artifacts.require("TesterChainlink")
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");
// const NFT1155 = artifacts.require("NFT1155");

const { expect } = require('chai');
const Contract = require('web3-eth-contract');

const data = require("./data.js").data;
require('./utils');

const { getTokenData } = require("./utils");

const fromWei = web3.utils.fromWei;
const toWei = web3.utils.toWei;

const Bn = (_value) => {
    return new BN(_value)
}

const DUMMY_ADDRESS1 = "0x5866e7451Cdd287a2375eFB669DB69398836A0E3";
const DUMMY_ADDRESS2 = "0x2bfe110B0812D67b3f602D7c3B643b37Cb7B0FC9";

const SECONDS_IN_DAY = 86400;
require("./constants");
require("./utils");

Contract.setProvider("ws://localhost:9545");

const tokens = (value) => {
    return web3.utils.toWei(value.toString());
}

const debugFlag = true;

const debug = (message1, message2) => {
    if (debugFlag) {
        console.log(
            `${message1}: ${message2.toString()}`
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

    const [owner, alice, bob, multisig, chad] = accounts;

    let token, pool, nft, factory, router, pricingData, initialTargetPool,testerPool;

    const BORROW_TOKEN_ID = 1;

    describe("Fee Tests", () => {

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

            await token.mint(
                tokens(10000),
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

            await nft.mint(
                {
                    from: bob
                }
            );

            await nft.approve(
                router.address,
                BORROW_TOKEN_ID,
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
        })

        it("Change fee addresses and bulk", async() => {

            let currentFeeAddress = await pool.feeDestinationAddress();

            const BORROW_TOKEN_ID = 1;

            assert.equal(
                currentFeeAddress,
                router.address
            );

            await expectRevert(
                pool.changeFeeDestinationAddress(
                    bob
                ),
                "LiquidPool: NOT_ROUTER"
            );

            await expectRevert(
                router.changeFeeDestinationAddress(
                    [pool.address],
                    [bob],
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await router.changeFeeDestinationAddress(
                [pool.address],
                [bob],
                {
                    from: multisig
                }
            );

            currentFeeAddress = await pool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress,
                bob
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                web3.utils.toWei("1"),
                toWei("0.5"),
                [nft.address],
                "Pool Shares2",
                "POOL2",
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

            const newPool = await LiquidPoolTester.at(
                poolAddress
            );

            pricingData = getTokenData(
                BORROW_TOKEN_ID
            );

            const poolArray = [pool.address, newPool.address];
            const changeArray = [bob, alice];
            const wrongPoolArray = [bob, alice];

            await expectRevert(
                router.changeFeeDestinationAddress(
                    poolArray,
                    changeArray,
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await expectRevert.unspecified(
                router.changeFeeDestinationAddress(
                    wrongPoolArray,
                    changeArray,
                    {
                        from: multisig
                    }
                )
            );

            await router.changeFeeDestinationAddress(
                poolArray,
                changeArray,
                {
                    from: multisig
                }
            );

            currentFeeAddress = await pool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress,
                bob
            );

            currentFeeAddress = await newPool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress,
                alice
            );
        });

        it("Fee Shares get allocated correctly", async() => {

            let feeShares = await pool.internalShares(
                router.address
            );

            assert.equal(
                feeShares.toString(),
                "0"
            );

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
                BORROW_TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const fees = await pool.fee();

            assert.equal(
                fees.toString(),
                toWei("0.2")
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

            feeShares = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(feeShares),
                parseInt(0)
            );
        });

        it("predict fee shares", async() => {

            const BORROW_TOKEN_ID = 1;
            const timeIncrease = SECONDS_IN_DAY * 10;

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            // why
            let getCurrentBorrowRate = await pool.borrowRate();

            assert.equal(
                getCurrentBorrowRate.toString(),
                "0"
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            pricingData = getTokenData(
                BORROW_TOKEN_ID
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
                BORROW_TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            getCurrentBorrowRate = await pool.borrowRate();
            const getCurrentTotalTokensDue = await pool.totalTokensDue();

            await time.increase(
                timeIncrease
            );

            const amountInterest = getCurrentBorrowRate
                .mul(Bn(getCurrentTotalTokensDue))
                .mul(Bn(timeIncrease))
                .div(Bn(364 * SECONDS_IN_DAY))
                .div(Bn(toWei("1")));

            const fee = await pool.fee();

            debug("amountInterest", amountInterest);

            const amountFee = amountInterest
                .mul(new BN(fee))
                .div(new BN(toWei("1")));

            const internalShares = await pool.totalInternalShares();

            const pseudoTotalBefore = await pool.pseudoTotalTokensHeld();

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            const pseudoTotal = await pool.pseudoTotalTokensHeld();

            const barePseudoTotal = Bn(pseudoTotal)
                .sub(Bn(toWei("1")));

            const diff = barePseudoTotal.sub(pseudoTotalBefore)

            debug("diff", diff);

            const feeSharesCalc = amountFee
                .mul(Bn(internalShares))
                .div(
                    Bn(barePseudoTotal).sub(Bn(amountFee))
                );

            feeShares = await pool.internalShares(
                router.address
            );

            debug("feeShares", feeShares);
            debug("feeSharesCalc", feeSharesCalc);

            assert(
                comparingTwoNumbers(
                    feeShares,
                    feeSharesCalc,
                    "0.0001",
                    true
                )
            );
        });

        it("withdraw fees as admin and changed admin", async() => {

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

            let routerShares = await pool.internalShares(
                router.address
            );

            assert.equal(
                routerShares.toString(),
                "0"
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
                BORROW_TOKEN_ID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            await time.increase(
                SECONDS_IN_DAY * 10
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            let routerBal = await token.balanceOf(
                router.address
            );

            assert.equal(
                routerBal.toString(),
                "0"
            );

            routerShares = await pool.internalShares(
                router.address
            );

            assert.isAbove(
                parseInt(routerShares),
                parseInt(0)
            );

            await router.withdrawFees(
                [pool.address],
                [routerShares],
                {
                    from: bob
                }
            );

            routerBal = await token.balanceOf(
                router.address
            );

            assert.isAbove(
                parseInt(routerBal),
                parseInt(0)
            );

            let routerSharesAfter = await pool.internalShares(
                router.address
            );

            debug("routerSharesAfter", routerSharesAfter);

            assert.isAbove(
                parseInt(routerShares),
                parseInt(routerSharesAfter)
            );

            await router.changeFeeDestinationAddress(
                [pool.address],
                [chad],
                {
                    from: multisig
                }
            );

            await time.increase(
                SECONDS_IN_DAY
            );

            let chadShares = await pool.internalShares(
                chad
            );

            assert.equal(
                chadShares.toString(),
                "0"
            );

            let chadBalance = await token.balanceOf(
                chad
            );

            assert.equal(
                chadBalance.toString(),
                "0"
            );

            await router.depositFunds(
                tokens(1),
                pool.address,
                {
                    from: alice
                }
            );

            chadShares = await pool.internalShares(
                chad
            );

            chadBalance = await token.balanceOf(
                chad
            );

            assert.equal(
                chadBalance.toString(),
                "0"
            );

            assert.isAbove(
                parseInt(chadShares),
                parseInt(0)
            );

            await router.withdrawFunds(
                chadShares,
                pool.address,
                {
                    from: chad
                }
            );

            chadBalance = await token.balanceOf(
                chad
            );

            assert.isAbove(
                parseInt(chadBalance),
                parseInt(0)
            );

            await token.approve(
                router.address,
                toWei("10000000000"),
                {
                    from: bob
                }
            );

            await token.mint(
                tokens(10000),
                {
                    from: bob
                }
            );

            await router.paybackFunds(
                pool.address,
                toWei("100"),
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            const aliceShares = await pool.internalShares(
                alice
            );

            await router.withdrawFunds(
                aliceShares,
                pool.address,
                {
                    from: alice
                }
            );

            const routerShare2 = await pool.internalShares(
                alice
            );

            debug("routerShare2", routerShare2);

            chadShares = await pool.internalShares(
                chad
            );

            debug("chadShares2", chadShares);

            await router.withdrawFunds(
                chadShares,
                pool.address,
                {
                    from: chad
                }
            );

            chadShares = await pool.internalShares(
                chad
            );

            chadShares = new BN(chadShares);

            if (chadShares > 0) {

                await router.withdrawFunds(
                    chadShares,
                    pool.address,
                    {
                        from: chad
                    }
                );
            }

            routerShares = await pool.internalShares(
                router.address
            );

            if (routerShares > 0) {
                await router.withdrawFees(
                    [pool.address],
                    [routerShares],
                    {
                        from: bob
                    }
                );
            }

            const tokenBalContract = await token.balanceOf(
                pool.address
            );

            assert.isAbove(
                parseInt(2),
                parseInt(tokenBalContract)
            );
        });

        it("revoke fee change test", async() => {

            const BORROW_TOKEN_ID = 1;

            let currentFeeAddress = await pool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress,
                router.address
            );

            await expectRevert(
                pool.changeFeeDestinationAddress(
                    bob,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: NOT_ROUTER"
            );

            await expectRevert(
                router.changeFeeDestinationAddress(
                    [pool.address],
                    [bob],
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await router.changeFeeDestinationAddress(
                [pool.address],
                [bob],
                {
                    from: multisig
                }
            );

            currentFeeAddress = await pool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress,
                bob
            );

            poolCount = await factory.poolCount();

            await factory.createLiquidPool(
                token.address,
                chainlinkETH.address,
                web3.utils.toWei("1"),
                toWei("0.5"),
                [nft.address],
                "Pool Shares",
                "POOL",
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

            let newPool = await LiquidPoolTester.at(
                poolAddress
            );

            pricingData = getTokenData(
                BORROW_TOKEN_ID
            );

            const poolArray = [pool.address, newPool.address];
            const addressArray = [alice, alice];
            const wrongPoolArray = [bob, newPool.address];

            await expectRevert(
                router.changeFeeDestinationAddress(
                    poolArray,
                    addressArray,
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await expectRevert.unspecified(
                router.changeFeeDestinationAddress(
                    wrongPoolArray,
                    addressArray,
                    {
                        from: multisig
                    }
                )
            );

            await router.changeFeeDestinationAddress(
                poolArray,
                addressArray,
                {
                    from: multisig
                }
            );

            const currentFeeAddress1 = await pool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress1,
                alice
            );

            const currentFeeAddress2 = await newPool.feeDestinationAddress();

            assert.equal(
                currentFeeAddress2,
                alice
            );
        });
    });
});
