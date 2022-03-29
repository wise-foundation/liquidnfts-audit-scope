const LiquidLocker = artifacts.require("LiquidLocker");
const AltLocker1 = artifacts.require("../../alternativeTokenLockers/alt1/LiquidLocker");
const AltLocker2 = artifacts.require("../../alternativeTokenLockers/alt2/LiquidLocker");
const LiquidFactory = artifacts.require("LiquidFactory");

const CryptoPunks = artifacts.require("CryptoPunksMarket");

const { BN, expectRevert } = require('@openzeppelin/test-helpers');

const ERC20 = artifacts.require("Token");
const NFT721 = artifacts.require("NFT721");
const NFT1155 = artifacts.require("NFT1155");

const { expect } = require('chai');
const timeMachine = require('ganache-time-traveler');
const Contract = require('web3-eth-contract');

Contract.setProvider("ws://localhost:9545");

const tokens = (value) => {
    return web3.utils.toWei(value.toString());
}

const debugFlag = true;

function debug( message ){
    if(debugFlag){
        console.log(message);
    }
}

const getLastEvent = async (eventName, instance) => {
    const events = await instance.getPastEvents(eventName, {
        fromBlock: 0,
        toBlock: "latest",
    });
    return events.pop().returnValues;
};

contract("PunkUsage", async accounts => {

    const [owner, alice, bob] = accounts;

    let punks;

    let factory, locker, usdc;

    const startLocker = async (punkIndex, punkOwner) => {
        const counter = await factory.lockerCount();
        const target = await factory.getImplementation(usdc.address);

        const predicted = await factory.predictLockerAddress(
            counter,
            factory.address,
            target
        );

        await punks.offerPunkForSaleToAddress(
            punkIndex,
            0,
            factory.address,
            {
                from : punkOwner
            }
        )
        await factory.createLiquidLocker(
            [punkIndex],
            punks.address,
            tokens(600),
            tokens(600),
            86400 * 10,
            10,
            usdc.address,
            {from: punkOwner, gas: 3000000}
        );

        locker = await LiquidLocker.at(predicted);

        await Promise.all([owner, alice, bob].map(
            acc => usdc.approve(
                locker.address,
                tokens(5000),
                { from: acc }
            )
        ));

    }


    before(async() => {

        punks = await CryptoPunks.at(
            "0xEb59fE75AC86dF3997A990EDe100b90DDCf9a826"
        );

        usdc = await ERC20.at(
            '0xb70C4d4578AeF63A1CecFF8bF4aE1BCeDD187a6b' //pre-deploy
        );

        factory = await LiquidFactory.at(
            '0x938bE4C47B909613441427db721B66D73dDd58c0' //pre-deploy
        );

        await punks.setInitialOwners(
            [alice, alice, alice, alice, alice, alice, alice, alice, bob],
            [10, 100, 101, 102, 103, 104, 105, 106, 15]
        );
        await punks.allInitialOwnersAssigned();

    });

    describe("Deploy Punks", () => {
        it("Punks are setup and constructor has been called", async () => {

            const name = await punks.name();

            assert.equal(name, "CRYPTOPUNKS");

            const symbol = await punks.symbol();

            assert.equal(symbol, "Ͼ");

        });
        it("Punks minted to accounts", async () => {

            const TensOwner = await punks.punkIndexToAddress(10);

            assert.equal(TensOwner, alice);

            const FifteensOwner = await punks.punkIndexToAddress(15);

            assert.equal(FifteensOwner, bob);

        })
        it("offerPunkForSaleToAddress and then buy works", async() => {
            await punks.offerPunkForSaleToAddress(
                100,
                0,
                bob,
                {
                    from : alice
                }
            )
            await punks.buyPunk(
                100,
                {
                    from : bob,
                    value : 0
                }
            );

            const TensOwner = await punks.punkIndexToAddress(100);
            debug(TensOwner);
            debug(bob);
            assert.equal(TensOwner, bob);

        });
    });

    describe("LiquidNFT loan from punk", () => {
        beforeEach(async() => {

            locker = await LiquidLocker.new();

            await factory.updateDefaultTarget(
                locker.address
            );

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

            await Promise.all([owner, alice, bob].map(
                acc => usdc.approve(
                    factory.address,
                    tokens(5000),
                    { from: acc }
                )
            ));
        });

        it("Locker accepts punk", async() => {


        })

        it("Contributions on punk work", async() => {

            await startLocker(10, alice);

            await factory.contributeToLocker(
                locker.address,
                tokens(200),
                {
                    from: bob,
                    gas: 200000
                }
            );

        })

        it("Locker allows punk withdraw", async() => {

            await startLocker(101, alice);

            await factory.contributeToLocker(
                locker.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 3);

            await factory.paybackToLocker(
                locker.address,
                tokens(500),
                {
                    from : alice,
                    gas : 2000000
                }
            );
        });

        it("locker liquidation transfers nft as expected", async() => {

            await startLocker(102, alice);

            await factory.contributeToLocker(
                locker.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 17);

            await locker.liquidateLocker(
                {
                    from : bob,
                    gas : 2000000
                }
            )

            const punkOwnerAfterLiquidation = await punks.punkIndexToAddress(102);
            debug(punkOwnerAfterLiquidation);
            debug(alice);
            debug(bob);
            assert.equal(punkOwnerAfterLiquidation, bob);
        })

        it("Exact pay loan early", async() => {

            await startLocker(103, alice);

            await factory.contributeToLocker(
                locker.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 3);

            await factory.paybackToLocker(
                locker.address,
                tokens(660),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            const towner = await punks.punkIndexToAddress(103);

            assert.equal(alice,towner);

        });

        it("Factory uses multiple token types", async () => {
            let altLocker = await AltLocker1.new();
            const eth = await ERC20.at(
                '0x5e5f71DeABb6d22bBBe098Ad092A2d1b76De9357' //pre-deploy
            );


            await factory.updateImplementation(
                eth.address,
                altLocker.address
            );

            await Promise.all([alice, bob].map(
                acc => eth.mint(
                    tokens(5000),
                    {from: acc }
                )
            ));

            await Promise.all([owner, alice, bob].map(
                acc => eth.approve(
                    factory.address,
                    tokens(5000),
                    { from: acc }
                )
            ));

            let altLocker2 = await AltLocker2.new();

            const wise = await ERC20.at(
                '0xd627ba3B9D89b99aa140BbdefD005e8CdF395a25' //pre-deploy
            );

            await factory.updateImplementation(
                wise.address,
                altLocker2.address
            );

            await Promise.all([alice, bob].map(
                acc => wise.mint(
                    tokens(5000),
                    {from: acc }
                )
            ));

            await Promise.all([owner, alice, bob].map(
                acc => wise.approve(
                    factory.address,
                    tokens(5000),
                    { from: acc }
                )
            ));

            await factory.updateImplementation(
                eth.address,
                altLocker.address
            );

            await Promise.all([alice, bob].map(
                acc => eth.mint(
                    tokens(5000),
                    {from: acc }
                )
            ));

            await Promise.all([owner, alice, bob].map(
                acc => eth.approve(
                    factory.address,
                    tokens(5000),
                    { from: acc }
                )
            ));

            let counter = await factory.lockerCount();
            const wrongTarget = await factory.getImplementation(usdc.address);
            let target = await factory.getImplementation(eth.address);

            const wrongPrediction = await factory.predictLockerAddress(
                counter,
                factory.address,
                wrongTarget
            )

            let predicted = await factory.predictLockerAddress(
                counter,
                factory.address,
                target
            );

            await punks.offerPunkForSaleToAddress(
                104,
                0,
                factory.address,
                {
                    from : alice
                }
            );

            await factory.createLiquidLocker(
                [104],
                punks.address,
                tokens(600),
                tokens(600),
                86400 * 10,
                10,
                eth.address,
                {from: alice, gas: 3000000}
            );

            locker = await LiquidLocker.at(predicted);

            //Have to do it like this since the error comes from the parse of the code, cant just try catch on contract.at(address)
            const contractCode = await web3.eth.getCode(wrongPrediction);
            assert.equal(contractCode, "0x");

            await Promise.all([owner, alice, bob].map(
                acc => eth.approve(
                    locker.address,
                    tokens(5000),
                    { from: acc }
                )
            ));

            counter = await factory.lockerCount();
            target = await factory.getImplementation(wise.address);

            predicted = await factory.predictLockerAddress(
                counter,
                factory.address,
                target
            );

            await punks.offerPunkForSaleToAddress(
                105,
                0,
                factory.address,
                {
                    from : alice
                }
            );

            await factory.createLiquidLocker(
                [105],
                punks.address,
                tokens(600),
                tokens(600),
                86400 * 10,
                10,
                wise.address,
                {from: alice, gas: 3000000}
            );

            const lockerWise = await LiquidLocker.at(predicted);

            counter = await factory.lockerCount();
            target = await factory.getImplementation(usdc.address);

            predicted = await factory.predictLockerAddress(
                counter,
                factory.address,
                target
            );

            await punks.offerPunkForSaleToAddress(
                106,
                0,
                factory.address,
                {
                    from : alice
                }
            );

            await factory.createLiquidLocker(
                [106],
                punks.address,
                tokens(600),
                tokens(600),
                86400 * 10,
                10,
                usdc.address,
                {from: alice, gas: 3000000}
            );

            const lockerUSDC = await LiquidLocker.at(predicted);


            await factory.contributeToLocker(
                lockerWise.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await factory.contributeToLocker(
                lockerUSDC.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await factory.contributeToLocker(
                locker.address,
                tokens(600),
                {
                    from: bob,
                    gas: 200000
                }
            );

            await lockerUSDC.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 4);

            await factory.paybackToLocker(
                lockerUSDC.address,
                tokens(500),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await locker.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 3);

            await factory.paybackToLocker(
                locker.address,
                tokens(500),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await lockerWise.enableLocker(
                tokens(0),
                {
                    from : alice,
                    gas : 2000000
                }
            );

            await timeMachine.advanceTimeAndBlock(86400 * 11);

            await lockerWise.liquidateLocker(
                {
                    from : bob,
                    gas : 2000000
                }
            );

            const punkOwnerAfterLiquidation = await punks.punkIndexToAddress(105);
            assert.equal(punkOwnerAfterLiquidation, bob);

        })
    })
})