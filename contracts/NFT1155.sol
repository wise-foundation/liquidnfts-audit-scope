// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract NFT1155 is ERC1155 {

    uint256 tokenId;

    mapping(address => uint256[]) public tokenIds;

    constructor()
        ERC1155(
            "uri.string"
        )
    {
        // initialize
    }

    function mint(
        uint256 _amount
    )
        external
    {
        tokenId =
        tokenId + 1;

        tokenIds[msg.sender].push(
            tokenId
        );

        _mint(
            msg.sender,
            tokenId,
            _amount,
            new bytes(0)
        );
    }

    function burn(
        uint256 _tokenId,
        uint256 _amount
    )
        external
    {
        _burn(
            msg.sender,
            _tokenId,
            _amount
        );
    }
}
