const LiquidPoolTester = artifacts.require("TesterPool");
const LiquidFactory = artifacts.require("PoolFactory");
const LiquidRouter = artifacts.require("LiquidRouter");
const Chainlink = artifacts.require("TesterChainlink");
const data = require("./data.js").data;

const { BN, expectRevert, time } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants.js");

const ERC20 = artifacts.require("TestToken");
const NFT721 = artifacts.require("NFT721");
// const NFT1155 = artifacts.require("NFT1155");

const { expect, assert } = require('chai');
const Contract = require('web3-eth-contract');
const { itShouldThrow, getTokenData} = require('./utils');

const debugFlag = true;

const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;
require("./constants");
require("./utils");


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

    let token, pool, nft, pricingData, initialTargetPool,testerPool;

    describe("Uncovered Lines Test", () => {

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

            pricingData = getTokenData(
                1
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

        it("Initialize can only be called by factory", async ()=>{

            await expectRevert(
                factory.updateDefaultPoolTarget(
                    initialTargetPool,
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await expectRevert(
                factory.createLiquidPool(
                token.address,
                chainlinkUSDC.address,
                web3.utils.toWei("1"),
                toWei("0.5"),
                [nft.address],
                "Pool Shares",
                "POOL",
                {
                    from: bob
                }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            const poolDecimals = await pool.decimals();
            const tokenDecimals = await token.decimals();

            console.log(
                poolDecimals.toString(),
                'poolDecimals'
            );

            assert.equal(
                tokenDecimals.toString(),
                poolDecimals.toString()
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

            await expectRevert(
                pool.depositFunds(
                    toWei("1"),
                    owner
                ),
                "LiquidPool: NOT_ROUTER"
            );

            await expectRevert(
                pool.initialise(
                    token.address,
                    chainlinkETH.address,
                    toWei("1"),
                    toWei("1"),
                    [nft.address],
                    "Pool Shares",
                    "PS",
                    {
                        from: bob
                    }
                ),
                "LiquidPool: POOL_DEFINED"
            );

            await pool.getCurrentDepositAPY();
            await pool.maxWithdrawAmount(
                alice
            );

            //... here seems unfinished test why do 2 request to pool?
        });

        it("Deposit/borrowfunds/paybackFunds funds can only be called by router", async ()=>{

            await expectRevert(
                pool.borrowFunds(
                    pool.address,
                    tokens(10),
                    nft.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                ),
                "LiquidPool: NOT_ROUTER"
            );

            await expectRevert(
                pool.paybackFunds(
                    toWei("100"),
                    nft.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,

                    {
                        from: bob
                    }
                ),
                "LiquidPool: NOT_ROUTER"
            );
        });

        it("Trigger updateborrowRate above threshhold when called through router", async() => {

            await expectRevert(
                router.depositFunds(
                    toWei("25"),
                    factory.address,
                    {
                        from: alice
                    }
                ),
                "LiquidRouter: UNKNOWN_POOL"
            );

            await router.depositFunds(
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                2 * SECONDS_IN_3HOUR
            );

            await router.depositFunds(
                toWei("1"),
                pool.address,
                {
                    from: alice
                }
            );

            let totalPoolAfter = await pool.totalPool();

            await time.increase(
                2 * SECONDS_IN_3HOUR
            );

            await expectRevert(
                router.withdrawFunds(
                    totalPoolAfter,
                    bob,
                    {
                        from: alice
                    }
                ),
                "LiquidRouter: UNKNOWN_POOL"
            );

            await router.withdrawFunds(
                totalPoolAfter,
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                2 * SECONDS_IN_3HOUR
            );

            await router.depositFunds(
                toWei("1"),
                pool.address,
                {
                    from: alice
                }
            );

            await router.withdrawFunds(
                toWei("0.5"),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                2 * SECONDS_IN_3HOUR
            );


            await router.withdrawFunds(
                toWei("0.5"),
                pool.address,
                {
                    from: alice
                }
            );
        });

        it("Trigger known collection modifier", async() => {


            let nft2 = await NFT721.new();

            await token.approve(
                pool.address,
                tokens(10000),
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
                1,
                {
                    from: alice
                }
            );

            await nft2.mint(
                {
                    from: alice
                }
            );

            await nft2.approve(
                router.address,
                1,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    toWei("1"),
                    nft2.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: alice
                    }
                ),
            "LiquidPool: UNKNOWN_COLLECTION"
        );

            await expectRevert(
                router.paybackFunds(
                    pool.address,
                    toWei("100"),
                    nft2.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    pricingData.proof,
                    {
                        from: alice
                    }
                ),
            "LiquidPool: UNKNOWN_COLLECTION"
        );

        });

        it("Trigger timeIncrease and Wrong proof with borrowFunds", async() => {

            await token.approve(
                pool.address,
                tokens(10000),
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
                1,
                {
                    from: alice
                }
            );

            await router.depositFunds(
                tokens(1000),
                pool.address,
                {
                    from: alice
                }
            );

            pricingData = getTokenData(
                1
            );
            let wrongproof = ['0x0'];

            await expectRevert(
                router.borrowFunds(
                    pool.address,
                    tokens(20),
                    nft.address,
                    1,
                    pricingData.index,
                    pricingData.amount,
                    wrongproof,
                    {
                        from: alice
                    }
                ),
                "LiquidPool: INVALID_PROOF"
            );

            await expectRevert(
                router.borrowFunds(
                    bob,
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
                "LiquidRouter: UNKNOWN_POOL"
            );

            await pool.checkCollateralValue(
                nft.address,
                1,
                pricingData.index,
                pricingData.amount,
                pricingData.proof,
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

            await router.borrowFunds(
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
            );
        });

        it("New cleanUp test ", async () => {

            let multisigBal = await token.balanceOf(
                router.address
            );

            assert.equal(
                multisigBal.toString(),
                "0"
            );

            await router.depositFunds(
                toWei("25"),
                pool.address,
                {
                    from: alice
                }
            );

            await time.increase(
                1000
            );

            await token.transfer(
                pool.address,toWei("1"),
                {
                    from: alice
                }
            );

            await router.depositFunds(
                toWei("3"),
                pool.address,
                {
                    from: alice
                }
            );

            multisigBal = await token.balanceOf(
                router.address
            );

            assert.equal(
                multisigBal.toString(),
                toWei("1")
            );
        });

        it("Remove odd token", async() => {

            const newFee = 0.06;

            let tokenOdd = await ERC20.new(
                "Super Odd",
                "ODD"
            );

            await tokenOdd.mint(
                tokens(1000),
                {
                    from: alice
                }
            );

            await tokenOdd.transfer(
                pool.address,
                tokens(100),
                {
                    from: alice
                }
            );

            let fees = await pool.fee();
            const feeWei = toWei("0.20");

            assert.equal(
                fees.toString(),
                feeWei.toString()
            );

            await expectRevert(
                pool.rescueToken(
                    token.address,
                    {
                        from: multisig
                    }
                ),
                "LiquidPool: NOT_ALLOWED"
            );

            const oddTokenBal = await tokenOdd.balanceOf(
                pool.address
            );

            const balOdd = await tokenOdd.balanceOf(
                router.address
            );

            assert.equal(
                "0",
                balOdd.toString()
            );

            await pool.rescueToken(
                tokenOdd.address,
                {
                    from: multisig
                }
            );

            const balOddAfter = await tokenOdd.balanceOf(
                router.address
            );

            assert.equal(
                oddTokenBal.toString(),
                balOddAfter.toString()
            );

        });

        it("AddLiquidPool revert plus access control tests ", async ()=>{

            await expectRevert(
                router.addLiquidPool(
                    bob,
                    {
                        from: alice
                    }
                ),
                "NOT_FACTORY"
            );

            let minPole = await pool.minPole();

            console.log(
                minPole.toString()
            );

            await router.addWorker(
                pool.address,
                bob,
                {
                    from: multisig
                }
            );

            let boolean = await router.workers(
                pool.address,
                bob
            );

            assert.equal(
                "true",
                boolean.toString()
            );

            await router.removeWorker(
                pool.address,
                bob,
                {
                    from: multisig
                }
            );

            boolean = await router.workers(
                pool.address,
                bob
            );

            assert.equal(
                "false",
                boolean.toString()
            );

            let newMultisig = await router.updateMultisig(
                bob,
                {
                    from: multisig
                }
            );

            newMultisig = await router.multisig();

            assert.equal(
                bob,
                newMultisig.toString()
            );
        });
    });

    describe("Merkle root management through router tests", async() => {

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

            pricingData = getTokenData(
                1
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

        it("Only multisig can init merkle root and not allow overwrite existing merkle root", async() => {

            let nftNew = await NFT721.new();

            await expectRevert(
                router.addMerkleRoot(
                    nftNew.address,
                    data.merkleRoot,
                    "ipfs://wise/lqnftstkn",
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await router.addMerkleRoot(
                nftNew.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn",
                {
                    from: multisig
                }
            );

            await expectRevert(
                router.addMerkleRoot(
                    nftNew.address,
                    data.merkleRoot,
                    "ipfs://wise/lqnftstkn"
                ),
                "AccessControl: NOT_MULTISIG"
            );

            await expectRevert(
                router.addMerkleRoot(
                    nftNew.address,
                    data.merkleRoot,
                    "ipfs://wise/lqnftstkn",
                    {
                        from: multisig
                    }
                ),
                "LiquidRouter: OVERWRITE_DENIED"
            );

        });

        it("Begin update merkle root to router example", async() => {

            await expectRevert(
                router.startUpdateRoot(
                    nft.address,
                    web3.utils.asciiToHex("0x0"),
                    "LALA",
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_WORKER"
            );

            await router.startUpdateRoot(
                nft.address,
                web3.utils.asciiToHex("0x0"),
                "LALA",
                {
                    from: multisig
                }
            );

            await time.increase(
                new BN(1000000)
            );

            const merkleBefore = await router.merkleRoot(nft.address);
            const IPFSBefore = await router.merkleIPFS(nft.address);

            assert.equal(
                merkleBefore.toString(),
                data.merkleRoot.toString()
            );

            assert.equal(
                IPFSBefore.toString(),
                "ipfs://wise/lqnftstkn"
            );

            await router.finishUpdateRoot(
                nft.address,
                {
                    from: multisig
                }
            );

            const merkleAfter = await router.merkleRoot(nft.address);
            const IPFSAfter = await router.merkleIPFS(nft.address);

            assert.notEqual(
                merkleBefore.toString(),
                merkleAfter.toString(),
            );

            assert.equal(
                IPFSAfter.toString(),
                "LALA"
            );

        });

        it("Pools can only expand if merkle root exists and flaged expandable", async() => {

            let newNFT = await NFT721.new();

            await router.addWorker(
                pool.address,
                multisig,
                {
                    from: multisig
                }
            );

            await expectRevert(
                router.startExpandPool(
                    pool.address,
                    newNFT.address,
                    {
                        from: multisig
                    }
                ),
                "LiquidRouter: ROOT_NOT_FOUND"
            );

            await expectRevert(
                router.startExpandPool(
                    pool.address,
                    newNFT.address,
                    {
                        from: bob
                    }
                ),
                "AccessControl: NOT_WORKER"
            );

            await router.addMerkleRoot(
                newNFT.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn",
                {
                    from: multisig
                }
            );

            await router.startExpandPool(
                pool.address,
                newNFT.address,
                {
                    from: multisig
                }
            );

            await router.revokeExpansion(
                pool.address,
                {
                    from: multisig
                }
            );

            await expectRevert(
                router.startExpandPool(
                    pool.address,
                    newNFT.address,
                    {
                        from: multisig
                    }
                ),
                "LiquidRouter: NOT_EXPANDABLE"
            );
        });

        it("Pool expansion can only be called by router", async() => {

            let newNFT = await NFT721.new();

            await expectRevert(
                pool.addCollection(
                    newNFT.address
                ),
                "LiquidPool: NOT_ROUTER"
            );
        });

        it("Finish pool expansion tests", async() => {

            let newNFT = await NFT721.new();

            await router.addWorker(
                pool.address,
                multisig,
                {
                    from: multisig
                }
            );

            await router.addMerkleRoot(
                newNFT.address,
                data.merkleRoot,
                "ipfs://wise/lqnftstkn",
                {
                    from: multisig
                }
            );

            await router.startExpandPool(
                pool.address,
                newNFT.address,
                {
                    from: multisig
                }
            );

            await time.increase(
                new BN(1000000)
            );

            const nftColl = await pool.nftAddresses(newNFT.address);

            assert.equal(
                nftColl,
                false
            )

            await router.finishExpandPool(
                pool.address,
                {
                    from: multisig
                }
            );

            const nftCollAfter = await pool.nftAddresses(newNFT.address);

            assert.equal(
                true,
                nftCollAfter
            );
        });
    });
})
