const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");

const { BN, expectRevert, time} = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");

const { expect } = require('chai');
const Contract = require('web3-eth-contract');

const data = require("./data.js").data;
require('./utils');
require("./constants");


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

const debug = (message) => {
    if (debugFlag) {
        console.log(
            message
        );
    }
}

const getLastEvent = async (eventName, instance) => {

    const events = await instance.getPastEvents(
        eventName,
        {
            fromBlock: 0,
            toBlock: "latest",
        }
    );

    return events.pop().returnValues;
};

contract("instantPools", async accounts => {

    const [owner, alice, bob] = accounts;

    let token, pool, nft,testerPool;

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
            web3.utils.toWei("2"),
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

    describe("Merkle Tree Tests", () => {

        it("Basic merkle tree execution path", async () => {

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

            //50% collateralization 10 tokens default borrow max pool

            console.log(data.merkleRoot, "MR")

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

            await router.depositFunds(
                toWei("1000"),
                pool.address,
                {
                    from: alice
                }
            );

            root = await router.merkleRoot(
                nft.address,
            );

            debug(root);

            const borrowedTokenID = 1;

            // use helper function to retrieve data
            const pricingData = getTokenData(
                borrowedTokenID
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

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    toWei("3000"),
                    nft.address,
                    borrowedTokenID,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: bob
                    }
                ),
                "LiquidPool: LOAN_TOO_LARGE"
            );

            await router.borrowFunds(
                pool.address,
                toWei("50"),
                nft.address,
                borrowedTokenID,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
                {
                    from: bob
                }
            );

            verifiedPrice = await pool.getMaximumBorrow(
                "100000000000000000000"
            );

            debug(
                verifiedPrice.toString()
            );

            assert.equal(
                verifiedPrice.toString(),
                "50000000000000000000"
            );

            verifiedPrice = await pool.getMaximumBorrow(
                "200000000000000000000"
            );

            debug(
                verifiedPrice.toString()
            );

            assert.equal(
                verifiedPrice.toString(),
                "100000000000000000000"
            );
        });

        it("Updating merkle root correctly updates root after 72 hours", async () =>{

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
                toWei("1"),
                50,
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

            root = await router.merkleRoot(
                nft.address
            );

            debug(root);
            debug(owner);

            await router.startUpdateRoot(
                nft.address,
                "0xffffffff090a338d30ea5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff",
                "ipfs://wise/lqnftstkn",
                {
                    from: owner
                }
            );

            currentRoot = await router.merkleRoot(
                nft.address
            );

            assert.equal(
                root,
                currentRoot
            );

            nextRoot = await router.pendingRoots(
                nft.address
            );

            assert.equal(
                nextRoot.merkleRoot,
                "0xffffffff090a338d30ea5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff"
            );

            await expectRevert(
                router.finishUpdateRoot(
                    nft.address,
                    {
                        from: owner
                    }
                ),
                "LiquidRouter: TOO_EARLY"
            );

            await expectRevert(
                router.startUpdateRoot(
                    nft.address,
                    "0xffffffff090affffffff5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff",
                    "ipfs://wise/lqnftstkn",
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_WORKER"
            );

            await expectRevert(
                router.startUpdateRoot(
                    "0xc6D716dEFC86ED9d2Fd8A0541F89e3F0156a394E",
                    "0xffffffff090affffffff5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff",
                    "ipfs://wise/lqnftstkn",
                    {
                        from: owner
                    }
                ),
                "AccessControl: NOT_WORKER"
            );

            await time.increase(
                1 * SECONDS_IN_DAY
            );

            await router.addWorker(
                nft.address,
                owner
            );

            await router.startUpdateRoot(
                    nft.address,
                    "0xffffffff090affffffff5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff",
                    "ipfs://wise/lqnftstkn",
                {
                    from: owner
                }
            );

            await time.increase(
                1 * SECONDS_IN_DAY
            );

            await expectRevert(
                router.finishUpdateRoot(
                    nft.address,
                    {
                        from: owner
                    }
                ),
                "LiquidRouter: TOO_EARLY"
            );

            await time.increase(
                3 * SECONDS_IN_DAY
            );

            await router.finishUpdateRoot(
                nft.address,
                {
                    from: owner
                }
            );

            currentRoot = await router.merkleRoot(
                nft.address
            );

            assert.equal(
                currentRoot.toString(),
                "0xffffffff090affffffff5de76d547cff8961a0cfb95df31ef5bda9e08d6fffff"
            );
        });
    });
});
