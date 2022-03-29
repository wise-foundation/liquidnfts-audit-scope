// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

contract LiquidTransfer {

    // cryptoPunks contract address
    address constant PUNKS = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;

    // local: 0xEb59fE75AC86dF3997A990EDe100b90DDCf9a826;
    // ropsten: 0x2f1dC6E3f732E2333A7073bc65335B90f07fE8b0;
    // mainnet: 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;

    // cryptoKitties contract address
    address constant KITTIES = 0x06012c8cf97BEaD5deAe237070F9587f8E7A266d;

    /* @dev
    * Checks if contract is nonstandard, does transfer according to contract implementation
    */
    function _transferNFT(
        address _from,
        address _to,
        address _tokenAddress,
        uint256 _tokenId
    )
        internal
    {
        bytes memory data;

        if (_tokenAddress == KITTIES) {
            data = abi.encodeWithSignature(
                "transfer(address,uint256)",
                _to,
                _tokenId
            );
        } else if (_tokenAddress == PUNKS) {
            data = abi.encodeWithSignature(
                "transferPunk(address,uint256)",
                _to,
                _tokenId
            );
        } else {
            data = abi.encodeWithSignature(
                "safeTransferFrom(address,address,uint256)",
                _from,
                _to,
                _tokenId
            );
        }

        (bool success,) = address(_tokenAddress).call(
            data
        );

        require(
            success == true,
            'NFT_TRANSFER_FAILED'
        );
    }

    /* @dev
    * Checks if contract is nonstandard, does transferFrom according to contract implementation
    */
    function _transferFromNFT(
        address _from,
        address _to,
        address _tokenAddress,
        uint256 _tokenId
    )
        internal
    {
        bytes memory data;

        if (_tokenAddress == KITTIES) {
            data = abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                _from,
                _to,
                _tokenId
            );
        } else if (_tokenAddress == PUNKS) {
            bytes memory punkIndexToAddress = abi.encodeWithSignature(
                "punkIndexToAddress(uint256)",
                _tokenId
            );

            (bool checkSuccess, bytes memory result) = address(_tokenAddress).staticcall(
                punkIndexToAddress
            );

            (address owner) = abi.decode(
                result,
                (address)
            );

            require(
                checkSuccess &&
                owner == msg.sender,
                'INVALID_OWNER'
            );

            bytes memory buyData = abi.encodeWithSignature(
                "buyPunk(uint256)",
                _tokenId
            );

            (bool buySuccess, bytes memory buyResultData) = address(_tokenAddress).call(
                buyData
            );

            require(
                buySuccess,
                string(buyResultData)
            );

            data = abi.encodeWithSignature(
                "transferPunk(address,uint256)",
                _to,
                _tokenId
            );

        } else {
            data = abi.encodeWithSignature(
                "safeTransferFrom(address,address,uint256)",
                _from,
                _to,
                _tokenId
            );
        }

        (bool success, bytes memory resultData) = address(_tokenAddress).call(
            data
        );

        require(
            success,
            string(resultData)
        );
    }

    event ERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes data
    );

    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata _data
    )
        external
        returns (bytes4)
    {
        emit ERC721Received(
            _operator,
            _from,
            _tokenId,
            _data
        );

        return this.onERC721Received.selector;
    }
}
