const Web3 = require('web3');
const web3 = new Web3('http://localhost:9545');

const name = "USDC";
const abbr = "USDC";

const TokenCode = require('./token.json').bytecode
const TokenAbi = require('./token.json').abi

async function deployToken() {

    try {
        const ganacheAccounts = await web3.eth.getAccounts();
        const contract = new web3.eth.Contract(TokenAbi);

        contract.deploy({
            arguments: [name, abbr],
            data: TokenCode
        }).send({
            from: ganacheAccounts[0],
            gas: 4712388,
            gasPrice: 100000000000
        }).then((deployment) => {
            console.log('Token was deployed at the following address:');
            console.log(deployment.options.address);
        }).catch((err) => {
            console.error(err);
        });

    } catch (e) {
        console.log(e);
    }
}


deployToken();
