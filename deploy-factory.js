const Web3 = require('web3');
const web3 = new Web3('http://localhost:9545');

// const p0 = "30";
const p1 = "0x0000000000000000000000000000000000000000";
const p2 = "0x0000000000000000000000000000000000000000";

const FactoryCode = require('./build/contracts/LiquidFactory.json').bytecode
const FactoryAbi = require('./build/contracts/LiquidFactory.json').abi

async function deployToken() {

    try {
        const ganacheAccounts = await web3.eth.getAccounts();
        const contract = new web3.eth.Contract(FactoryAbi);

        contract.deploy({
            arguments: [p1, p2],
            data: FactoryCode
        }).send({
            from: ganacheAccounts[0],
            gas: 4712388,
            gasPrice: 100000000000
        }).then((deployment) => {
            console.log('Factory was deployed at the following address:');
            console.log(deployment.options.address);
        }).catch((err) => {
            console.error(err);
        });

    } catch (e) {
        console.log(e);
    }
}


deployToken();
