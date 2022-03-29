// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFT721 is ERC721 {

    uint256 tokenId;

    mapping(address => uint256[]) public tokenIds;

    constructor()
        ERC721(
            "MyNFT",
            "MNFT"
        )
    {
        // initialize
    }

    function mint()
        external
    {
        tokenId =
        tokenId + 1;

        tokenIds[msg.sender].push(
            tokenId
        );

        _safeMint(
            msg.sender,
            tokenId
        );
    }

    function burn(
        uint256 _tokenId
    )
        external
    {
        _burn(
            _tokenId
        );
    }
}
