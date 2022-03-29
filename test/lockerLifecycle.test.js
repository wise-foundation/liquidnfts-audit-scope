const LiquidLocker = artifacts.require("LiquidLocker");
const LiquidFactory = artifacts.require("LiquidFactory");
const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const ERC20 = artifacts.require("Token");
const NFT721 = artifacts.require("NFT721");
const NFT1155 = artifacts.require("NFT1155");
const fromWei = web3.utils.fromWei;
const debugFlag = false;
const { expect } = require('chai');
const timeMachine = require('ganache-time-traveler');
const Contract = require('web3-eth-contract');
const {advanceTimeAndBlock} = require("ganache-time-traveler");

Contract.setProvider("ws://localhost:9545");

function debug(message) {
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

const SECONDS_IN_DAY = 86400;

const convertTime = (UNIX_timestamp) => {
    var a = new Date(parseInt(UNIX_timestamp) * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
    return time;
}

const compareDueTimeToBlockTime = async (locker) => {
    dueTime = await locker.nextDueTime();
    debug("dueTime: " + convertTime(dueTime.toString()));

    payTime = await locker.paybackTimestamp();
    debug("End Time: " + convertTime(payTime.toString()));

    lastBlock = await web3.eth.getBlockNumber();
    timestamp = (await web3.eth.getBlock(lastBlock)).timestamp;
    debug("Last block stamp: " + convertTime(timestamp.toString()) + "\n");
}

const addToLastBlockTimestamp = async (num) => {
    const lastBlock = await web3.eth.getBlockNumber();
    const timestamp = (await web3.eth.getBlock(lastBlock)).timestamp;
    const endDate = new BN(timestamp).add(new BN(num));
    return endDate;
}

contract("LiquidLocker", async accounts => {

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const [owner, alice, bob, random] = accounts;

    let nft;
    let usdc;
    let factory;
    let locker;
    let tokenId;
    let predicted;

    const tokens = (value) => {
        return web3.utils.toWei(
            value.toString()
        );
    }

    before(async() => {
        usdc = await ERC20.at(
            '0xb70C4d4578AeF63A1CecFF8bF4aE1BCeDD187a6b' //pre-deploy
        );

        factory = await LiquidFactory.at(
            '0x938bE4C47B909613441427db721B66D73dDd58c0' //pre-deploy
        );

        locker = await LiquidLocker.new();

        await factory.updateDefaultTarget(
            locker.address
        );

        await factory.updateImplementation(
            usdc.address,
            locker.address
        );

        await Promise.all([alice, bob, random].map(
            acc => usdc.mint(
                tokens(50000),
                {from: acc }
            )
        ));

        await Promise.all([owner, alice, bob, random].map(
            acc => usdc.approve(
                factory.address,
                tokens(50000),
                {
                    from: acc
                }
            )
        ));

        beforeEach( async() => {
            const target = await factory.getImplementation(
                usdc.address
            );
        })
    });

    describe("LiquidLockerLifecycle", () => {

        describe("Finish/Liquidate Loan", () => {

            it("Refunds for multiple contributors", async () => {

                bobStartBal = await usdc.balanceOf(
                    bob
                );

                randStartBal = await usdc.balanceOf(
                    random
                );

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(601),
                    tokens(12000),
                    SECONDS_IN_DAY * 10,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                ); //ran this with lower values for early disable/0 for immediate disable. All work as intended

                bobMiddleBal = await usdc.balanceOf(
                    bob
                );

                randMiddleBal = await usdc.balanceOf(
                    random
                );

                await locker.disableLocker({
                    from: alice
                });

                await locker.refundDueExpired(
                    bob,
                    {
                        from: bob
                    }
                );

                await locker.refundDueExpired(
                    random,
                    {
                        from: owner
                    }
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                debug(fromWei(bobMiddleBal.toString()));
                debug(fromWei(bobStartBal.toString()));
                debug(fromWei(randMiddleBal.toString()));
                debug(fromWei(randStartBal.toString()));

                assert.equal(bobBal.toString(), bobStartBal.toString());
                assert.equal(randBal.toString(), randStartBal.toString());

                lockerOwner = (await locker.globals()).lockerOwner;

                assert.equal(
                    lockerOwner,
                    ZERO_ADDRESS
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            });

            it("Refund after single contributor takes over", async () => {

                bobStartBal = await usdc.balanceOf(
                    bob
                );

                randStartBal = await usdc.balanceOf(
                    random
                );

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(600),
                    SECONDS_IN_DAY * 10,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await expectRevert(
                    locker.refundDueSingle(
                        bob,
                        {
                            from: bob
                        }
                    ),
                    "LiquidLocker: INVALID_SENDER"
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(1200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                bobMiddleBal = await usdc.balanceOf(
                    bob
                );

                randMiddleBal = await usdc.balanceOf(
                    random
                );

                await locker.refundDueSingle(
                    bob,
                    {
                        from: bob
                    }
                );

                bobBal = await usdc.balanceOf(bob);
                randBal = await usdc.balanceOf(random);

                debug(fromWei(bobMiddleBal.toString()));
                debug(fromWei(bobStartBal.toString()));
                debug(fromWei(randMiddleBal.toString()));
                debug(fromWei(randStartBal.toString()));

                assert.equal(
                    bobBal.toString(),
                    bobStartBal.toString()
                );

                assert.equal(
                    randBal.toString(),
                    randMiddleBal.toString()
                );

                lockerOwner = (await locker.globals()).lockerOwner;

                assert.equal(
                    lockerOwner,
                    alice
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    locker.address,
                    towner
                );
            });

            it("Test Refund on rescue locker disable", async () => {

                bobStartBal = await usdc.balanceOf(
                    bob
                );

                randStartBal = await usdc.balanceOf(
                    random
                );

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0),
                    SECONDS_IN_DAY * 10,
                    tokens(0),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await expectRevert.unspecified(
                    locker.enableLocker(
                        tokens(0),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    )
                );

                bobMiddleBal = await usdc.balanceOf(
                    bob
                );

                randMiddleBal = await usdc.balanceOf(
                    random
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 10
                );

                await locker.rescueLocker({
                    from: owner
                });

                lockerOwner = (await locker.globals()).lockerOwner;

                assert.equal(
                    lockerOwner,
                    ZERO_ADDRESS
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );

                await locker.refundDueExpired(
                    bob,
                    {
                        from: bob
                    }
                );

                await locker.refundDueExpired(
                    random,
                    {
                        from: owner
                    }
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );


                debug(fromWei(bobMiddleBal.toString()));
                debug(fromWei(bobStartBal.toString()));
                debug(fromWei(randMiddleBal.toString()));
                debug(fromWei(randStartBal.toString()));

                assert.equal(
                    bobBal.toString(),
                    bobStartBal.toString()
                );

                assert.equal(
                    randBal.toString(),
                    randStartBal.toString()
                );
            })

            it("Payoff on last days possible", async () => {

                nft = await NFT721.new();

                await nft.mint(
                    {
                        from: alice
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0),
                    SECONDS_IN_DAY * 300, //expect .2 token payoff needed per day with these params
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0.2),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await advanceTimeAndBlock(
                    SECONDS_IN_DAY * 7.5
                ); //because one day already covered 7.5 instead of 6.5, nextduetime is already on tomorrow when enable or payback gets called

                await factory.paybackToLocker(
                    locker.address,
                    tokens(0.2),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await expectRevert(
                    locker.liquidateLocker(
                        {
                            from: random,
                            gas: 2000000
                        }
                    ),
                    "LiquidLocker: TOO_EARLY"
                );

                await advanceTimeAndBlock(
                    SECONDS_IN_DAY * 7.5
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(0.2),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await advanceTimeAndBlock(
                    SECONDS_IN_DAY * 7.5
                );

                await expectRevert(
                    locker.liquidateLocker(
                        {
                            from: random,
                            gas: 2000000
                        }
                    ),
                    "LiquidLocker: TOO_EARLY"
                );

                await advanceTimeAndBlock(
                    SECONDS_IN_DAY * 1
                );

                await compareDueTimeToBlockTime(
                    locker
                );

                await locker.liquidateLocker(
                    {
                        from: random,
                        gas: 2000000
                    }
                );
            });

            it("Consecutive payoffs increase duetime", async () => {

                nft = await NFT721.new();

                await nft.mint(
                    {
                        from: alice
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300, //expect .2 token payoff needed per day with these params
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                debug("paying off 10 tokens of interest");

                await factory.paybackToLocker(
                    locker.address,
                    tokens(10),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                debug("paying off 10 tokens of interest no time advance");

                await factory.paybackToLocker(
                    locker.address,
                    tokens(10),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());
                await compareDueTimeToBlockTime(
                    locker
                );
            });

            it("Due date is calculated as intended over multiple payments", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(600),
                    SECONDS_IN_DAY * 30,
                    tokens(2),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await expectRevert(
                    factory.paybackToLocker(
                        locker.address,
                        tokens(0.0001),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    ),
                    "LiquidLocker: Minimum Payoff"
                );

                debug("Expect worked");
                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 6
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(0.41), //600 * .02 / 30 = .4 minimum payoff
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 6
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(0.41),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                remaining = await locker.remainingBalance();
                debug("remainingBal: " + remaining.toString());

                rate = (await locker.globals()).paymentRate;
                debug("rate: " + rate.toString());

                await compareDueTimeToBlockTime(
                    locker
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                //assert.equal("0xa803c226c8281550454523191375695928DcFE92",towner);
            });

            it("Liquidate Works with multiple nfts", async () => {

                nft = await NFT721.new();

                let tokenIds = [];

                for (let i = 0; i < 4; i++) {

                    await nft.mint({
                        from: alice
                    });

                    tokenId = (await nft.tokenIds(
                        alice,
                        i
                    )).toString();

                    tokenIds.push(
                        tokenId
                    );

                    towner = await nft.ownerOf(
                        tokenId
                    );

                    debug(towner);
                    debug(tokenId);
                }

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    tokenIds,
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 10,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(600),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 11
                );

                await locker.liquidateLocker({
                    from: random,
                    gas: 2000000
                });

                for (let i = 0; i < 4; i++) {
                    tokenId = (await nft.tokenIds(
                        alice,
                        i
                    )).toString();

                    towner = await nft.ownerOf(
                        tokenId
                    );

                    assert.equal(
                        bob,
                        towner
                    );
                }
            });

            it("Contributing on your own loan doe not break things", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 10,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                const bal0 = await usdc.balanceOf(
                    alice
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: alice,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                const bal2 = await usdc.balanceOf(
                    alice
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 11
                );

                await locker.liquidateLocker({
                    from: random,
                    gas: 2000000
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    "0x910c094b260c8b1493497a8d6A780f0A48f0b9E7",
                    towner
                );
            });

            it("Very small interest rate", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                  )
                ).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 10,
                    tokens(1),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 11
                );

                await locker.liquidateLocker({
                    from: random,
                    gas: 2000000
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                  )
                ).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    "0x910c094b260c8b1493497a8d6A780f0A48f0b9E7",
                    towner
                );
            });

            it("Zero interest rate", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 10,
                    tokens(0),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await expectRevert.unspecified(
                    locker.enableLocker(
                        tokens(0),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    )
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 10
                );

                await locker.rescueLocker({
                    from: owner
                });

                lockerOwner = (await locker.globals()).lockerOwner;

                assert.equal(
                    lockerOwner,
                    ZERO_ADDRESS
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                  )
                ).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            });

            it("Very large interest rate", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 10,
                    tokens(100),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                const bal0 = await usdc.balanceOf(
                    alice
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(300),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await expectRevert.unspecified(
                    locker.enableLocker(
                        tokens(0),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    )
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 10
                );

                await locker.rescueLocker(
                    {
                        from: owner
                    }
                );

                lockerOwner = (await locker.globals()).lockerOwner;

                assert.equal(
                    lockerOwner,
                    ZERO_ADDRESS
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            });

            it("Very long loan", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 36500, // 100 years
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                const bal0 = await usdc.balanceOf(
                    alice
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                const bal2 = await usdc.balanceOf(
                    alice
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(600),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 3650
                ); //going much bigger than this is impossible because internals of ganache exceed js number limit. Only 10 is years instead of 100 into future

                await factory.paybackToLocker(
                    locker.address,
                    tokens(60),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            });

            it("Very short loan", async () => {

                nft = await NFT721.new();

                await nft.mint(
                    {
                        from: alice
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 5 + 300, //5 minute loan, payment time is the actual final date, not how many days since enable
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                const bal1 = await usdc.balanceOf(
                    alice
                );

                //let dueTime = await locker.nextDueTime();

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                const bal2 = await usdc.balanceOf(
                    alice
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(600),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    60
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(60),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                const remaining = await locker.remainingBalance();

                debug(remaining.toString());
                debug(locker.address);
                debug(alice);
                debug(towner);

                assert.equal(
                    alice,
                    towner
                );
            });

            it("Penalty amount is as expected", async () => {

                nft = await NFT721.new();
                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 30,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                //let remaining = await locker.remainingBalance();

                for (let i = 0; i < 10; i++) {

                    await factory.paybackToLocker(
                        locker.address,
                        tokens(2.1),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    );

                    remaining = await locker.remainingBalance();

                    debug(i);
                    debug(remaining.toString());

                    await timeMachine.advanceTimeAndBlock(
                        SECONDS_IN_DAY * 1
                    );
                }
            });

            it("Interest collection works as predicted", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300, //expect .2 token payoff needed per day with these params
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(300),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(300),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                claimableBalance = await locker.claimableBalance();

                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");
                debug("Paying back 20 tokens and claiming interest \n");

                await factory.paybackToLocker(
                    locker.address,
                    tokens(20),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("after payback");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("after first claim");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                debug("after second claim");

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");
                debug("Paying back 5 tokens and claiming interest \n");

                await factory.paybackToLocker(
                    locker.address,
                    tokens(5),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("after payback");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(bob);
                bobBal = await usdc.balanceOf(bob);

                debug("after first claim");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                debug("after second claim");

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");
                debug("Paying back 20 tokens and claiming interest \n");

                await factory.paybackToLocker(
                    locker.address,
                    tokens(20),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("after payback");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("after first claim");
                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                await locker.claimInterest({
                    from: bob
                });

                debug("after second claim");

                claimableBalance = await locker.claimableBalance();
                compensationsBob = await locker.compensations(
                    bob
                );

                bobBal = await usdc.balanceOf(
                    bob
                );

                debug("claimableBalance: " + fromWei(claimableBalance.toString()));
                debug("BOB usdc bal: " + fromWei(bobBal.toString()));
                debug("Bob compensations: " + fromWei(compensationsBob.toString()) + "\n");

                //assert.equal(fromWei(compensationsBob.toString()), "10");
                //assert.equal(fromWei(claimableBalance.toString()), "20");
                //assert.equal(fromWei(bobBal.toString()), "49710"); //if tests are skipped this may break because other tests consume tokens ect.
            });

            it("Penalty test payoff", async () => {
                nft = await NFT721.new();

                await nft.mint(
                    {
                        from: alice
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), //delta
                    SECONDS_IN_DAY * 300,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                for (let i = 0; i < 9; i++) {
                    await timeMachine.advanceTimeAndBlock(
                        SECONDS_IN_DAY * 6
                    );

                    await factory.paybackToLocker(
                        locker.address,
                        tokens(0.21),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    )
                }

                claimable = await locker.claimableBalance();

                actualBalance = await usdc.balanceOf(
                    locker.address
                );

                debug("Claimable first " + fromWei(claimable.toString()));
                debug("actual tokens in contract " + fromWei(actualBalance.toString()));

                remaining = await locker.remainingBalance();

                debug("Remaining first " + fromWei(remaining.toString()));
                debug("\n");

                remaining = await locker.remainingBalance();
                debug("Remaing used for payback " + fromWei(remaining.toString()));

                await factory.paybackToLocker(
                    locker.address,
                    remaining.toString(),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                claimable = await locker.claimableBalance();
                actualBalance = await usdc.balanceOf(
                    locker.address
                );

                debug("Claimable before claim " + fromWei(claimable.toString()));
                debug("actual tokens in contract " + fromWei(actualBalance.toString()));

                remaining = await locker.remainingBalance();
                debug("Remaining before claim " + fromWei(remaining.toString()));
                debug("\n");

                await locker.claimInterest(
                    {
                        from: bob
                    }
                );

                claimable = await locker.claimableBalance();
                actualBalance = await usdc.balanceOf(
                    locker.address
                );

                debug("Claimable between " + fromWei(claimable.toString()));
                debug("actual tokens in contract " + fromWei(actualBalance.toString()));

                remaining = await locker.remainingBalance();

                debug("Remaining between " + fromWei(remaining.toString()));
                debug("\nBalances between");

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                ownerBal = await usdc.balanceOf(
                    owner
                );

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));

                await locker.claimInterest({
                    from: random
                });

                debug("\nBalances After");

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                ownerBal = await usdc.balanceOf(
                    owner
                );

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));
            })

            it("Penalty liquidate not enough test", async () => {
                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                for (let i = 0; i < 9; i++) {

                    await timeMachine.advanceTimeAndBlock(
                        SECONDS_IN_DAY * 6
                    );

                    await factory.paybackToLocker(
                        locker.address,
                        tokens(0.21),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    );
                }

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 12
                );

                debug("Balances Before Liquidate");

                bobBal = await usdc.balanceOf(bob);
                randBal = await usdc.balanceOf(random);
                ownerBal = await usdc.balanceOf(owner);

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));


                await locker.liquidateLocker({
                    from: random,
                    gas: 2000000
                });

                remaining = await locker.remainingBalance();

                debug("Balances After Liquidate");

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                ownerBal = await usdc.balanceOf(
                    owner
                );

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));
            })

            it("Penalty liquidate with enough test", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                for (let i = 0; i < 9; i++) {

                    await timeMachine.advanceTimeAndBlock(
                        SECONDS_IN_DAY * 6
                    );

                    await factory.paybackToLocker(
                        locker.address,
                        tokens(0.21),
                        {
                            from: alice,
                            gas: 2000000
                        }
                    )
                }

                await factory.paybackToLocker(
                    locker.address,
                    tokens(140),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 280
                );

                debug("Balances Before Liquidate");

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                ownerBal = await usdc.balanceOf(
                    owner
                );

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));

                await locker.liquidateLocker({
                    from: random,
                    gas: 2000000
                });

                remaining = await locker.remainingBalance();

                debug("Balances After Liquidate");

                bobBal = await usdc.balanceOf(
                    bob
                );

                randBal = await usdc.balanceOf(
                    random
                );

                ownerBal = await usdc.balanceOf(
                    owner
                );

                debug(fromWei(bobBal.toString()));
                debug(fromWei(randBal.toString()));
                debug(fromWei(ownerBal.toString()));
            })

            it("Increase Rate during contributions", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300,
                    tokens(1),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await locker.increasePaymentRate(
                    tokens(10),
                    {
                        from: alice
                    }
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(600),
                    {
                        from: alice,
                        gas: 2000000
                    }
                )

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(60),
                    {
                        from: alice,
                        gas: 2000000
                    }
                )

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            })

            it("Decrease Time during contributions", async () => {

                nft = await NFT721.new();

                await nft.mint({
                    from: alice
                });

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                await nft.setApprovalForAll(
                    factory.address,
                    true,
                    {
                        from: alice
                    }
                );

                await factory.createLiquidLocker(
                    [tokenId],
                    nft.address,
                    tokens(600),
                    tokens(0), // delta
                    SECONDS_IN_DAY * 300,
                    tokens(10),
                    usdc.address,
                    {
                        from: alice,
                        gas: 3000000
                    }
                );

                const res = await getLastEvent(
                    "NewLocker",
                    factory
                );

                locker = await LiquidLocker.at(
                    res.lockerAddress
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(200),
                    {
                        from: random,
                        gas: 200000
                    }
                );

                await locker.decreasePaymentTime(
                    SECONDS_IN_DAY * 30,
                    {
                        from: alice
                    }
                );

                time = (await locker.globals()).paymentTime;

                assert.equal(
                    time.toNumber(),
                    SECONDS_IN_DAY * 30
                );

                await factory.contributeToLocker(
                    locker.address,
                    tokens(400),
                    {
                        from: bob,
                        gas: 200000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await locker.enableLocker(
                    tokens(0),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(600),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                await timeMachine.advanceTimeAndBlock(
                    SECONDS_IN_DAY * 5
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(60),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                tokenId = (await nft.tokenIds(
                    alice,
                    0
                )).toString();

                towner = await nft.ownerOf(
                    tokenId
                );

                assert.equal(
                    alice,
                    towner
                );
            })
        })
    });

    describe("Test H2", () => {

        let expectedPenalty;
        it("Senario 1, multiple paybacks", async () => {

            nft = await NFT721.new();

            await nft.mint({
                from: alice
            });

            tokenId = (await nft.tokenIds(
                alice,
                0
            )).toString();

            await nft.setApprovalForAll(
                factory.address,
                true,
                {
                    from: alice
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            await factory.createLiquidLocker(
                [tokenId],
                nft.address,
                tokens(0),
                tokens(1000),
                SECONDS_IN_DAY * 7,
                tokens(30),
                usdc.address,
                {
                    from: alice,
                    gas: 3000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            const res = await getLastEvent(
                "NewLocker",
                factory
            );

            locker = await LiquidLocker.at(
                res.lockerAddress
            );

            await factory.contributeToLocker(
                locker.address,
                tokens(200),
                {
                    from: random,
                    gas: 200000
                }
            );

            await factory.contributeToLocker(
                locker.address,
                tokens(800),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            await timeMachine.advanceTimeAndBlock(
                SECONDS_IN_DAY * 7
            );

            await factory.paybackToLocker(
                locker.address,
                tokens(100),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            await timeMachine.advanceTimeAndBlock(
                SECONDS_IN_DAY * 7
            );

            // penalties = await locker.penaltiesBalance();
            // debug(fromWei(penalties.toString()));

            remaining = await locker.remainingBalance();
            debug(fromWei(remaining.toString()));

            await factory.paybackToLocker(
                locker.address,
                tokens(100),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            await factory.paybackToLocker(
                locker.address,
                tokens(100),
                {
                    from: alice,
                    gas: 2000000
                }
            );

                albal = await usdc.balanceOf(
                    alice
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(100),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                albal = await usdc.balanceOf(
                    alice
                );

                await factory.paybackToLocker(
                    locker.address,
                    tokens(100),
                    {
                        from: alice,
                        gas: 2000000
                    }
                );

                albal = await usdc.balanceOf(
                    alice
                );

                //debug(fromWei(albal.toString()));
                // penalties = await locker.penaltiesBalance();

                remaining = await locker.remainingBalance();
                debug(fromWei(remaining.toString()));
                // expectedPenalty = penalties;

                /*
                for(let i = 0; i < 9; i++) {

                    await timeMachine.advanceTimeAndBlock(SECONDS_IN_DAY * 6);

                    await factory.paybackToLocker(
                      locker.address,
                      tokens(0.21),
                      {
                          from: alice,
                          gas: 2000000
                      }
                    )

                    penalties = await locker.penaltiesBalance();

                    debug(i);
                    debug(fromWei(penalties.toString()));

                }
                */
            })

        it("Senario 2, one payback", async () => {
            // counter = await factory.lockerCount();
            target = await factory.getImplementation(
                usdc.address
            );

            nft = await NFT721.new();

            await nft.mint({
                from: alice
            });

            tokenId = (await nft.tokenIds(
                alice,
                0
            )).toString();

            await nft.setApprovalForAll(
                factory.address,
                true,
                {
                    from: alice
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            await factory.createLiquidLocker(
                [tokenId],
                nft.address,
                tokens(0),
                tokens(1000),
                SECONDS_IN_DAY * 7,
                tokens(30),
                usdc.address,
                {
                    from: alice,
                    gas: 3000000
                }
            );

            const res = await getLastEvent(
                "NewLocker",
                factory
            );

            locker = await LiquidLocker.at(
                res.lockerAddress
            );

            await factory.contributeToLocker(
                locker.address,
                tokens(200),
                {
                    from: random,
                    gas: 200000
                }
            );

            await factory.contributeToLocker(
                locker.address,
                tokens(800),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            await timeMachine.advanceTimeAndBlock(
                SECONDS_IN_DAY * 7
            );

            await factory.paybackToLocker(
                locker.address,
                tokens(100),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            await timeMachine.advanceTimeAndBlock(
                SECONDS_IN_DAY * 7
            );

            // penalties = await locker.penaltiesBalance();

            // debug(fromWei(penalties.toString()));
            remaining = await locker.remainingBalance();
            debug(fromWei(remaining.toString()));

            await factory.paybackToLocker(
                locker.address,
                tokens(400),
                {
                    from: alice,
                    gas: 2000000
                }
            );

            albal = await usdc.balanceOf(
                alice
            );

            //debug(fromWei(albal.toString()));

            // penalties = await locker.penaltiesBalance();
            // debug("Penalites: " + fromWei(penalties.toString()));
            remaining = await locker.remainingBalance();

            debug(
                fromWei(remaining.toString())
            );

            // assert.equal(
                // expectedPenalty.toString(),
                // penalties.toString()
            // );
        });
    });
});
