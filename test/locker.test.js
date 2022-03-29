const LiquidLocker = artifacts.require("LiquidLocker");
const LiquidFactory = artifacts.require("LiquidFactory");

const { BN, expectRevert } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("Token");
const NFT721 = artifacts.require("NFT721");
const NFT1155 = artifacts.require("NFT1155");

const { expect } = require('chai');
const timeMachine = require('ganache-time-traveler');
const Contract = require('web3-eth-contract');
const SECONDS_IN_DAY = 86400;

Contract.setProvider("ws://localhost:9545");

const getLastEvent = async (eventName, instance) => {
    const events = await instance.getPastEvents(eventName, {
        fromBlock: 0,
        toBlock: "latest",
    });
    return events.pop().returnValues;
};

contract("LiquidLocker", async accounts => {

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const [owner, alice, bob, random] = accounts;

    let nft
    let usdc
    let factory
    let locker
    let indexer;

    const tokens = (value) => {
        return web3.utils.toWei(
            value.toString()
        );
    }

    beforeEach(async() => {

        /*usdc = await ERC20.new(
            "USDC",
            "USDC"
        );
        console.log(usdc.address, 'usdc');*/
        // npm run deploy-token (< --- run this first)

        usdc = await ERC20.at(
            '0xb70C4d4578AeF63A1CecFF8bF4aE1BCeDD187a6b' //pre-deploy
        );

        factory = await LiquidFactory.at(
            '0x938bE4C47B909613441427db721B66D73dDd58c0' //pre-deploy
        );

        locker = await LiquidLocker.new();

        /*factory = await LiquidFactory.new(
            20,
            usdc.address,
            locker.address
        );*/

        await factory.updateDefaultTarget(
            locker.address
        );

        // console.log(usdc.address, 'usdc.address');

        await factory.updateImplementation(
            usdc.address,
            locker.address
        );

        await Promise.all([alice, bob].map(
            acc => usdc.mint(
                tokens(5000),
                {from: acc }
            )
        ));

        nft = await NFT721.new();
        await nft.mint();

        const tokenId = await nft.tokenIds(
            owner,
            0
        );

        const target = await factory.getImplementation(
            usdc.address
        );

        await nft.approve(
            factory.address,
            tokenId,
            {from: owner}
        );

        await factory.createLiquidLocker(
            [tokenId],
            nft.address,
            tokens(600),
            tokens(0),
            SECONDS_IN_DAY * 10,
            tokens(10),
            usdc.address,
            {from: owner, gas: 3000000}
        );

        const res = await getLastEvent(
            "NewLocker",
            factory
        );

        const lockerTwo = await LiquidLocker.at(res.lockerAddress);
        await lockerTwo.disableLocker();

        await nft.approve(
            factory.address,
            tokenId,
            {from: owner}
        );

        await factory.createLiquidLocker(
            [tokenId],
            nft.address,
            tokens(600),
            tokens(300),
            SECONDS_IN_DAY * 10,
            tokens(10),
            usdc.address,
            {from: owner, gas: 3000000}
        );

        const { lockerAddress } = await getLastEvent(
            "NewLocker",
            factory
        );

        await Promise.all([owner, alice, bob].map(
            acc => usdc.approve(
                lockerAddress,
                tokens(5000),
                { from: acc }
            )
        ));

        await Promise.all([owner, alice, bob].map(
            acc => usdc.approve(
                factory.address,
                tokens(5000),
                { from: acc }
            )
        ));

        const nftBalance = await nft.balanceOf(
            lockerAddress
        );

        locker = await LiquidLocker.at(lockerAddress);

        assert.equal(
            new BN(nftBalance).toNumber(),
            new BN(1).toNumber()
        );
    });

    describe("LiquidLocker", () => {

        describe("Deactivate Loan and refund", () => {

            it("should allow to deposit tokens during contribution phase only", async () => {

                isContributionPhase = await locker.contributionPhase();

                assert.equal(
                    isContributionPhase,
                    true
                );

                // const counter = await factory.lockerCount();
                // console.log(counter.toString(), 'counter');

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(SECONDS_IN_DAY * 12);

                isContributionPhase = await locker.contributionPhase();

                assert.equal(
                    isContributionPhase,
                    false
                );

                await expectRevert(
                    factory.contributeToLocker(
                        locker.address,
                        tokens(200),
                        {
                            from: alice,
                            gas: 200000
                        }
                    ),
                    'LiquidLocker: INVALID_PHASE'
                )
            });

            it("should allow to withdraw NFT if the floor is not reached", async () => {

                const time = await locker.creationTime();

                const isContributionPhase = await locker.contributionPhase();
                const floorAsked = await locker.floorAsked();

                const transferA = tokens(100);

                await factory.contributeToLocker(
                    locker.address,
                    transferA,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const totalCollectedA = await locker.totalCollected();

                assert.equal(
                    totalCollectedA.toString(),
                    transferA
                );

                const transferB = tokens(200);
                await factory.contributeToLocker(
                    locker.address,
                    transferB,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const belowFloorAsked = await locker.belowFloorAsked();
                const totalCollectedAB = await locker.totalCollected();

                assert.equal(
                    belowFloorAsked,
                    true
                );

                assert.equal(
                    belowFloorAsked,
                    parseInt(transferA) + parseInt(transferB) < parseInt(floorAsked)
                );

                assert.equal(
                    belowFloorAsked,
                    totalCollectedAB < parseInt(floorAsked)
                );

                assert.equal(
                    totalCollectedAB.toString(),
                    parseInt(transferA) + parseInt(transferB)
                );

                assert.isBelow(
                    parseInt(totalCollectedAB),
                    parseInt(floorAsked)
                );

                await expectRevert(
                    locker.disableLocker(
                        { from: bob }
                    ),
                    'revert LiquidLocker: INVALID_OWNER'
                );

                const nftBalanceBefore = await nft.balanceOf(
                    locker.address
                );

                assert.equal(
                    parseInt(nftBalanceBefore),
                    parseInt(1)
                );

                await locker.disableLocker(
                    { from: owner }
                );

                const nftBalanceAfter = await nft.balanceOf(
                    locker.address
                );

                assert.equal(
                    parseInt(nftBalanceAfter),
                    parseInt(0)
                );
            });

            it("should allow to retrieve tokens any time if not funded enough", async () => {

                const transferA = tokens(100);
                await factory.contributeToLocker(
                    locker.address,
                    transferA,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const byAlice = await locker.contributions(alice);

                assert.equal(
                    byAlice.toString(),
                    transferA.toString()
                );

                const transferB = tokens(200);
                await factory.contributeToLocker(
                    locker.address,
                    transferB,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const byBob = await locker.contributions(bob);

                assert.equal(
                    byBob.toString(),
                    transferB.toString()
                );

                await expectRevert(
                    locker.refundDueExpired(
                        alice,
                        {from: alice}
                    ),
                    'revert LiquidLocker: ENABLED_LOCKER'
                );

                await expectRevert(
                    locker.refundDueExpired(
                        bob,
                        {from: bob}
                    ),
                    'revert LiquidLocker: ENABLED_LOCKER'
                );

                await expectRevert(
                    locker.refundDueExpired(
                        random,
                        {from: random}
                    ),
                    'revert LiquidLocker: ENABLED_LOCKER'
                );

                const laterDays = SECONDS_IN_DAY * 6;
                await timeMachine.advanceTimeAndBlock(laterDays);

                await locker.refundDueExpired(
                    random,
                    {from: random}
                );

                const tEvent = await getLastEvent(
                    "Transfer",
                    usdc
                );

                assert.equal(
                    tEvent.value.toString(),
                    "0"
                );

                await locker.refundDueExpired(
                    bob,
                    {from: bob}
                );

                const { from, to, value } = await getLastEvent(
                    "Transfer",
                    usdc
                );

                assert.equal(
                    from,
                    locker.address
                );

                assert.equal(
                    to,
                    bob
                );

                assert.equal(
                    value,
                    byBob
                );

                const byBobAfter = await locker.contributions(bob);

                assert.equal(
                    byBobAfter.toString(),
                    "0"
                );

                await locker.refundDueExpired(
                    alice,
                    {from: alice}
                );

                const byAliceAfter = await locker.contributions(alice);

                assert.equal(
                    byAliceAfter.toString(),
                    "0"
                );
            });

            it("should NOT allow to withdraw NFT if the floor is reached", async () => {

                const time = await locker.creationTime();

                const isContributionPhase = await locker.contributionPhase();
                const floorAsked = await locker.floorAsked();

                const transferA = tokens(300);

                await factory.contributeToLocker(
                    locker.address,
                    transferA,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const totalCollectedA = await locker.totalCollected();

                assert.equal(
                    totalCollectedA.toString(),
                    transferA
                );

                const transferB = tokens(300);
                await factory.contributeToLocker(
                    locker.address,
                    transferB,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const belowFloorAsked = await locker.belowFloorAsked();
                const totalCollectedAB = await locker.totalCollected();

                assert.equal(
                    belowFloorAsked,
                    false
                );

                assert.equal(
                    belowFloorAsked,
                    transferA + transferB < parseInt(floorAsked)
                );

                assert.equal(
                    belowFloorAsked,
                    totalCollectedAB < parseInt(floorAsked)
                );

                assert.equal(
                    totalCollectedAB.toString(),
                    (parseInt(transferA) + parseInt(transferB)).toString()
                );

                assert.equal(
                    parseInt(totalCollectedAB),
                    parseInt(floorAsked)
                );

                await expectRevert(
                    locker.disableLocker(
                        { from: bob }
                    ),
                    'revert LiquidLocker: INVALID_OWNER'
                );

                await expectRevert(
                    locker.disableLocker(
                        { from: owner }
                    ),
                    'revert LiquidLocker: FLOOR_REACHED'
                );
            });

            it("should NOT allow to enable locker if floor is not reached", async () => {

                const time = await locker.creationTime();

                const isContributionPhase = await locker.contributionPhase();
                const floorAsked = await locker.floorAsked();

                const transferA = tokens(200);

                await factory.contributeToLocker(
                    locker.address,
                    transferA,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const totalCollectedA = await locker.totalCollected();

                assert.equal(
                    totalCollectedA.toString(),
                    transferA
                );

                const transferB = tokens(300);
                await factory.contributeToLocker(
                    locker.address,
                    transferB,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const belowFloorAsked = await locker.belowFloorAsked();
                const totalCollectedAB = await locker.totalCollected();

                assert.equal(
                    belowFloorAsked,
                    true
                );

                assert.equal(
                    belowFloorAsked,
                    parseInt(transferA) + parseInt(transferB) < parseInt(floorAsked)
                );

                assert.equal(
                    belowFloorAsked,
                    totalCollectedAB < parseInt(floorAsked)
                );

                assert.equal(
                    totalCollectedAB.toString(),
                    parseInt(transferA) + parseInt(transferB)
                );

                assert.isBelow(
                    parseInt(totalCollectedAB),
                    parseInt(floorAsked)
                );

                await expectRevert(
                    locker.enableLocker(
                        0,
                        { from: bob }
                    ),
                    'revert LiquidLocker: INVALID_OWNER'
                );

                await expectRevert(
                    locker.enableLocker(
                        0,
                        { from: owner }
                    ),
                    'revert LiquidLocker: BELOW_FLOOR'
                );
            });

            it("should only allow to contribute to maxAsked (single)", async () => {

                const floorAsked = await locker.floorAsked();
                const totalAsked = await locker.totalAsked();

                await factory.contributeToLocker(
                    locker.address,
                    totalAsked,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const recordA = await locker.contributions(alice);

                assert.equal(
                    parseInt(recordA),
                    parseInt(totalAsked)
                );

                await expectRevert(
                    factory.contributeToLocker(
                        locker.address,
                        floorAsked,
                        {
                            from: alice,
                            gas: 200000
                        }
                    ),
                    'revert LiquidLocker: PROVIDER_EXISTS'
                );

                await expectRevert(
                    factory.contributeToLocker(
                        locker.address,
                        totalAsked,
                        {
                            from: bob,
                            gas: 200000
                        }
                    ),
                    'revert LiquidLocker: PROVIDER_EXISTS'
                );

                // console.log(floorAsked.toString(), 'floorAsked');
                // console.log(totalAsked.toString(), 'totalAsked');

                const totalCollected = await locker.totalCollected();
                // const totalAsked = await locker.totalAsked();
                const recordB = await locker.contributions(bob);

                assert.equal(
                    parseInt(recordB),
                    parseInt(0)
                );

                assert.equal(
                    parseInt(totalCollected.toString()),
                    parseInt(totalAsked.toString())
                );

                // console.log(recordB.toString(), 'recordB');
                // console.log(totalCollected.toString(), 'totalCollected');

                await factory.contributeToLocker(
                    locker.address,
                    floorAsked,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const recordC = await locker.contributions(bob);
                const totalCollectedAfter = await locker.totalCollected();

                assert.equal(
                    parseInt(totalCollected.toString()),
                    parseInt(totalCollectedAfter.toString())
                );

                assert.equal(
                    parseInt(recordC),
                    parseInt(0)
                );
            });

            it("should only allow to contribute to maxAsked (multiple)", async () => {

                const floorAsked = await locker.floorAsked();
                const totalAsked = await locker.totalAsked();

                await factory.contributeToLocker(
                    locker.address,
                    floorAsked,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const recordA = await locker.contributions(alice);

                assert.equal(
                    parseInt(recordA),
                    parseInt(floorAsked)
                );

                await factory.contributeToLocker(
                    locker.address,
                    floorAsked,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const recordB = await locker.contributions(bob);

                assert.equal(
                    parseInt(recordB),
                    parseInt(totalAsked) - parseInt(recordA)
                );
            });

            it("should allow to overtake as a single contributor", async () => {

                const floorAsked = await locker.floorAsked();
                const totalAsked = await locker.totalAsked();

                const recordI = await locker.contributions(alice);
                // console.log(recordI.toString(), 'recordI');

                assert.equal(
                    parseInt(recordI),
                    parseInt(0)
                );

                await factory.contributeToLocker(
                    locker.address,
                    floorAsked,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const recordA = await locker.contributions(alice);

                // console.log(floorAsked.toString(), 'ff');
                // console.log(recordA.toString(), 'ff');

                assert.equal(
                    parseInt(recordA),
                    parseInt(floorAsked)
                );

                await factory.contributeToLocker(
                    locker.address,
                    totalAsked,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const recordB = await locker.contributions(bob);

                assert.equal(
                    parseInt(recordB),
                    parseInt(totalAsked)
                );

                const single = await locker.singleProvider();

                assert.equal(
                    parseInt(single),
                    parseInt(bob)
                );
            });

            it("should allow to withdraw if single provider present", async () => {

                const floorAsked = await locker.floorAsked();
                const totalAsked = await locker.totalAsked();

                const recordI = await locker.contributions(alice);
                // console.log(recordI.toString(), 'recordI');

                assert.equal(
                    parseInt(recordI),
                    parseInt(0)
                );

                await factory.contributeToLocker(
                    locker.address,
                    floorAsked,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const recordA = await locker.contributions(alice);

                assert.equal(
                    parseInt(recordA),
                    parseInt(floorAsked)
                );

                await expectRevert(
                    locker.refundDueSingle(
                        alice,
                        {from: alice}
                    ),
                    'INVALID_SENDER'
                );

                await factory.contributeToLocker(
                    locker.address,
                    totalAsked,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const recordB = await locker.contributions(bob);

                assert.equal(
                    parseInt(recordB),
                    parseInt(totalAsked)
                );

                const single = await locker.singleProvider();

                assert.equal(
                    parseInt(single),
                    parseInt(bob)
                );

                await expectRevert(
                    locker.refundDueSingle(
                        bob,
                        {from: bob}
                    ),
                    'INVALID_SENDER'
                );

                await locker.refundDueSingle(
                    owner,
                    {from: owner}
                );

                const tEvent = await getLastEvent(
                    "Transfer",
                    usdc
                );

                assert.equal(
                    tEvent.value.toString(),
                    "0"
                );

                await locker.refundDueSingle(
                    alice,
                    {from: alice}
                );

                const { from, to, value } = await getLastEvent(
                    "Transfer",
                    usdc
                );

                assert.equal(
                    from,
                    locker.address
                );

                assert.equal(
                    parseInt(to),
                    parseInt(alice)
                );

                assert.equal(
                    parseInt(value),
                    parseInt(recordA)
                );

                await usdc.transfer(
                    random,
                    100,
                    {
                        from: alice
                    }
                );

                locker.refundDueSingle(
                    alice,
                    {from: alice}
                );

                const anotherEvent = await getLastEvent(
                    "Transfer",
                    usdc
                );

                assert.equal(
                    anotherEvent.from,
                    alice
                );

                assert.equal(
                    anotherEvent.to,
                    random
                );

                assert.equal(
                    anotherEvent.value.toString(),
                    "100"
                );
            });
        });

        describe("Activate Loan", () => {


            it("should allow to activate locker and contribute payment", async () => {

                const transferA = tokens(100);
                const transferB = tokens(500);

                await factory.contributeToLocker(
                    locker.address,
                    transferA,
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                const belowFloorAskedA = await locker.belowFloorAsked();

                assert.equal(
                    belowFloorAskedA,
                    true
                );

                await factory.contributeToLocker(
                    locker.address,
                    transferB,
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                const belowFloorAskedB = await locker.belowFloorAsked();

                assert.equal(
                    belowFloorAskedB,
                    false
                );

                const floor = await locker.floorAsked();
                const total = await locker.totalCollected();
                const time = await locker.paymentTimeNotSet();
                const g = await locker.globals();

                // console.log(floor.toString(), 'floor');
                // console.log(total.toString(), 'total');
                // console.log(time, 'time');
                // console.log(g, 'g');

                await locker.enableLocker(
                    tokens(0)
                );
            });
        });

        describe.skip("Activate Loan", () => {
            it("deposit token equal to max and activiate it", async () => {
                await this.liquidNFT.makeContribution(800).send({ from: alice, gas: 200000 });
                await this.liquidNFT.makeContribution(800).send({ from: bob, gas: 200000 });

                expect(new BN(await this.usdc.balanceOf(alice)).toNumber())
                    .to.equal(new BN(4200).toNumber(4200));
                expect(new BN(await this.usdc.balanceOf(bob)).toNumber())
                    .to.equal(new BN(4200).toNumber(4200));
                expect(new BN(await this.usdc.balanceOf(this.liquidNFTContractAddress)).toNumber())
                    .to.equal(new BN(1600).toNumber(1600));

                await this.liquidNFT.methods.activateLoan().send({ from: owner, gas: 200000 });

                expect(await this.liquidNFT.methods.loanStatus().call()).to.equal("5"); //ACTIVE
                expect(new BN(await this.usdc.balanceOf(owner)).toNumber())
                    .to.equal(new BN(1600).toNumber(1600));
                expect(new BN(await this.usdc.balanceOf(this.liquidNFTContractAddress)).toNumber())
                    .to.equal(new BN(0).toNumber(0));
            });

        });

        describe.skip("MakePayment, return NFT and withdraw earned Interest", () => {
            it("deposit token, NFT owner pay back, return NFT to owner and vouchers withdraw earned interest ", async () => {
                await this.liquidNFT.methods.makeContribution(800).send({ from: alice, gas: 200000 });
                await this.liquidNFT.methods.makeContribution(800).send({ from: bob, gas: 200000 });

                await this.liquidNFT.methods.activateLoan().send({ from: owner, gas: 200000 });

                await this.usdc.approve(this.liquidNFTContractAddress, 5000);
                await this.liquidNFT.methods.makePayment(600).send({ from: owner, gas: 200000 });

                let laterDays = SECONDS_IN_DAY * 4; // 4 days later
                await timeMachine.advanceTimeAndBlock(laterDays);
                await this.liquidNFT.methods.makePayment(200).send({ from: owner, gas: 200000 });
                // (1600 - 600 - 200) + 4 * 1600 / 200 = 832
                expect(new BN(await this.liquidNFT.methods.remainingBalance().call()).toNumber())
                    .to.equal(new BN(832).toNumber(832));

                laterDays = SECONDS_IN_DAY * 6; // 6 days later
                await timeMachine.advanceTimeAndBlock(laterDays);
                await this.liquidNFT.methods.makePayment(200).send({ from: owner, gas: 200000 });
                // 832 - 200 + 4 * 1600 / 200 + (6 - 4) * 1600 / 100 = 696
                expect(new BN(await this.liquidNFT.methods.remainingBalance().call()).toNumber())
                    .to.equal(new BN(696).toNumber(696));

                // Owner gets some profit
                await this.usdc.mint(100, { from: owner });

                await this.liquidNFT.methods.makePayment(700).send({ from: owner, gas: 200000 });
                expect(await this.liquidNFT.methods.loanStatus().call()).to.equal("6"); //FINISHED
                expect(new BN(await this.usdc.balanceOf(this.liquidNFTContractAddress)).toNumber())
                    .to.equal(new BN(1696).toNumber(1696)); // 1600 - 696
                expect(new BN(await this.usdc.balanceOf(owner)).toNumber())
                    .to.equal(new BN(4).toNumber(4)); // 700 - 696

                // Return NFT
                const tokenId = await this.myNFT.tokenIds(owner, 0);
                await this.liquidNFT.methods.returnNFT().send({ from: owner });
                expect(new BN(await this.myNFT.balanceOf(owner)).toNumber())
                    .to.equal(new BN(1).toNumber(1));

                // Withdraw earned interest
                await this.liquidNFT.methods.withdrawEarnedInterest().send({ from: alice });
                await this.liquidNFT.methods.withdrawEarnedInterest().send({ from: bob });
                expect(new BN(await this.usdc.balanceOf(alice)).toNumber())
                    .to.equal(new BN(5048).toNumber(5048)); // 5000 - 800 + 1696 * 800 / 1600
                expect(new BN(await this.usdc.balanceOf(bob)).toNumber())
                    .to.equal(new BN(5048).toNumber(5048));
            });
        });

        describe.skip("Withdraw NFT", () => {
            it("Do not pay interest more than 15 days and NFT is withdrawn", async () => {
                await this.liquidNFT.methods.makeContribution(800).send({ from: alice, gas: 200000 });
                await this.liquidNFT.methods.makeContribution(800).send({ from: bob, gas: 200000 });

                await this.liquidNFT.methods.activateLoan().send({ from: owner, gas: 200000 });

                await this.usdc.approve(this.liquidNFTContractAddress, 5000);

                let laterDays = SECONDS_IN_DAY * 16; // 16 days later
                await timeMachine.advanceTimeAndBlock(laterDays);
                await this.liquidNFT.methods.makePayment(200).send({ from: owner, gas: 200000 });

                expect(await this.liquidNFT.methods.loanStatus().call()).to.equal("4"); //DEFAULTED
                await this.liquidNFT.methods.withdrawNFT().send({ from: owner });
                expect(new BN(await this.myNFT.balanceOf(this.liquidNFTFactory.address)).toNumber())
                    .to.equal(new BN(1).toNumber(1));
            });
        });
    });
})
