
tokens = (value) => {
    return web3.utils.toWei(value.toString());
}

Bn = (_value) => {
    return new BN(_value)
}

tokensPlusDust = (value) => {
    return new BN(
        web3.utils.toWei(value.toString())
    ).add(new BN(1))
}

tokenPlusOne = (_value) => {
    return new BN(
        _value
    ).add(new BN(1))
}

tokensMinusDust = (value) => {
    return new BN(
        web3.utils.toWei(value.toString())
    ).sub(new BN(1))
}

toWei = web3.utils.toWei;

advanceTime = time => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [time],
                id: new Date().getTime()
            },
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                return resolve(result);
            }
        );
    });
};

advanceBlock = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_mine",
                id: new Date().getTime()
            },
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                const newBlockHash = web3.eth.getBlock("latest").hash;

                return resolve(newBlockHash);
            }
        );
    });
};

takeSnapshot = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_snapshot",
                id: new Date().getTime()
            },
            (err, snapshotId) => {
                if (err) {
                    return reject(err);
                }
                return resolve(snapshotId);
            }
        );
    });
};

revertToSnapShot = id => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_revert",
                params: [id],
                id: new Date().getTime()
            },
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                return resolve(result);
            }
        );
    });
};

advanceTimeAndBlock = async time => {
    await advanceTime(time);
    await advanceBlock();
    return Promise.resolve(web3.eth.getBlock("latest"));
};

const BigNumber = require('bignumber.js');
const { BN } = require('bn.js');

const itShouldThrow = (reason, fun, expectedMessage) => {
    it(reason, async () => {
        let error = false;
        try {
            await Promise.resolve(fun()).catch((e) => {
                error = e;
            });
        } catch (e) {
            error = e;
        }

        // No error was returned or raised - make the test fail plain and simple.
        if (!error) {
            assert.ok(false, 'expected to throw, did not');
        }

        // No exception message was provided, we'll only test against the important VM ones.
        if (expectedMessage === undefined) {
            assert.match(
                error.message,
                /invalid JUMP|invalid opcode|out of gas|The contract code couldn't be stored, please check your gas amount/,
            );
        // An expected exception message was passed - match it.
        } else if (error.message.length > 0) {
            // Get the error message from require method within the contract
            const errorReason = error.message.match('Reason given: (.*)\\.');
            // If there's no message error provided, check for default errors
            if (errorReason === null) {
                assert.ok(
                    error.message.indexOf(expectedMessage) >= 0,
                    'threw the wrong exception type',
                );
            } else {
                assert.equal(
                    expectedMessage,
                    errorReason[1],
                    'threw the wrong exception type',
                );
            }
        // In case that nothing matches!
        } else {
            assert.ok(false, `something went wrong with asserts. Given error ${error}`);
        }
    });
};

getEvents = async (eventName, instance) => {
    return await instance.getPastEvents(eventName, {
        fromBlock: 0,
        toBlock: "latest",
    });
};

getLastEvent = async (eventName, instance) => {
    const events = await getEvents(eventName, instance);
    return events.pop().returnValues;
};

getFewLastEvents = async (eventName, instance, eventCount) => {
    const events = await getEvents(eventName, instance);
    return events
        .slice(events.length - eventCount, events.length)
        .map((event) => event.returnValues);
};

//custom precision comparison for bignumbers
//resultBN is a bignumber, but expected and precision are strings containing a number
//different argument types for ease of use in testing, results return from contract as BN,
//but user input has to use syntax to convert to BN
closeToBn = (resultBN, expected, precision) => {

    //if both numbers are 0, say they are equal. Do not divide by 0
    if(expected == 0 && resultBN.eq(new BN("0"))) return true;

    precision = new BN(toWei(precision));
    expected = new BN(toWei(expected));

    //console.log(bn1.toString());
    //console.log(bn2.toString());
    const ratioE18 = resultBN.mul(new BN("1000000000000000000")).div(expected);

    const upperBound = (new BN(web3.utils.toWei("1"))).add(precision);
    const lowerBound = (new BN(web3.utils.toWei("1"))).sub(precision);

    if( upperBound.cmp(ratioE18) < 0 ){
        console.error("Expected " + resultBN.toString() + " close to " + expected.toString());
        return false;
    }

    if( lowerBound.cmp(ratioE18) > 0 ){
        console.error("Expected " + resultBN.toString() + " close to " + expected.toString());
        return false;
    }
    return true;

};

//custom precision comparison for bignumbers
//resultBN and expected are bignumbers, but precision are strings containing a number
//different argument types for ease of use in testing, results return from contract as BN,
//but user input has to use syntax to convert to BN
closeToBnNumbers = (resultBN, expected, precision) => {

    //if both numbers are 0, say they are equal. Do not divide by 0
    if(expected == 0 && resultBN.eq(new BN("0"))) return true;

    precision = new BN(toWei(precision));
    //console.log(bn1.toString());
    //console.log(bn2.toString());
    const ratioE18 = resultBN.mul(new BN("1000000000000000000")).div(expected);

    const upperBound = (new BN(web3.utils.toWei("1"))).add(precision);
    const lowerBound = (new BN(web3.utils.toWei("1"))).sub(precision);

    if( upperBound.cmp(ratioE18) < 0 ){
        console.error("Expected " + resultBN.toString() + " close to " + expected.toString());
        return false;
    }

    if( lowerBound.cmp(ratioE18) > 0 ){
        console.error("Expected " + resultBN.toString() + " close to " + expected.toString());
        return false;
    }
    return true;

};

//custom functions comparison for bigNumbers
//resultA and resultB are BNs, order is a string containing the order
//how both numbers differ. 0.001 <=> differ at order 1E15
//NOTE: order = 1 <=> order 1E18, gives error for numbers which have order less 1E18
// order factor is gauged to 1E18!!!
comparingTwoNumbers = (resultA, resultB, order, debug = false) => {

    let ratio;

    if(resultA == 0 && resultB == 0) return true;

    let normalization = new BN(web3.utils.toWei(order));

    let term1 = new BN(resultA)
        .div(normalization);

    let term2 = new BN(resultB)
        .div(normalization);

    if(term2 == 0 || term1 == 0) {

        console.error("Oder factor is to high");

    }

    if(term1 >= term2) {

        ratio = term2
            .div(term1);
    }
    else {

        ratio = term1
        .div(term2);
    }

    if(debug == true) {

        console.log("term1: ",term1.toString());
        console.log("term2: ",term2.toString());
        console.log("ratio: ",ratio.toString());
    }

    if(ratio == 1) {

        return true;
    }
    else{

        console.error("ResultA: " + resultA.toString() + " close to " + resultB.toString());

        return false;
    }
};

getGovernanceIndentifier = (transactionBytes, addressTo) => {
    return web3.utils.keccak256(
            web3.eth.abi.encodeParameters(
            [
                'bytes',
                'address'
            ],
            [
                transactionBytes,
                addressTo
            ]
        )
    );
}

const data = require("./data.js").data;

getTokenData = (tokenID) => {
    // @TODO: use tokenId instead of key
    const item = Object.keys(data.tokens).find(
        (key) => key == tokenID
    );
    return data.tokens[item];
};

module.exports = {
    advanceTime,
    advanceBlock,
    itShouldThrow,
    advanceTimeAndBlock,
    takeSnapshot,
    revertToSnapShot,
    getEvents,
    getLastEvent,
    getFewLastEvents,
    closeToBn,
    getGovernanceIndentifier,
    tokensPlusDust,
    getTokenData
};