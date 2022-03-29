// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

contract LiquidBase {

    // Precision factor for interest rate in orders of 1E18
    uint256 public constant PRECISION_R = 100E18;

    // Team fee relative in orders of 1E18
    uint256 public constant FEE = 20E18;

    // Time before a liquidation will occur
    uint256 public constant DEADLINE_TIME = 7 days;

    // How long the contribution phase lasts
    uint256 public constant CONTRIBUTION_TIME = 5 days;

    // Amount of seconds in one day unit
    uint256 public constant SECONDS_IN_DAY = 86400;

    // Address if factory that creates lockers
    address public constant FACTORY_ADDRESS = 0x9961f05a53A1944001C0dF650A5aFF65B21A37D0;

    // Address to tranfer NFT to in event of non singleProvider liquidation
    address public constant TRUSTEE_MULTISIG = 0xfEc4264F728C056bD528E9e012cf4D943bd92b53;

    // ERC20 used for payments of this locker
    address public constant PAYMENT_TOKEN = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // Helper constant for comparison with 0x0 address
    address constant ZERO_ADDRESS = address(0);

    /*@dev
    * @element tokenID: NFT IDs
    * @element tokenAddress: address of NFT contract
    * @element paymentTime: how long loan will last
    * @element paymentRate: how much must be paid for loan
    * @element lockerOwner: who is taking out loan
    */
    struct Globals {
        uint256[] tokenId;
        uint256 paymentTime;
        uint256 paymentRate;
        address lockerOwner;
        address tokenAddress;
    }

    Globals public globals;

    // Address of single provider, is zero address if there is no single provider
    address public singleProvider;

    // Minimum the owner wants for the loan. If less than this contributors refunded
    uint256 public floorAsked;

    // Maximum the owner wants for the loan
    uint256 public totalAsked;

    // How many tokens have been collected for far for this loan
    uint256 public totalCollected;

    // Balance contributors can claim at a given moment
    uint256 public claimableBalance;

    // Balance the locker owner still owes
    uint256 public remainingBalance;

    // Time next payoff must happen to avoid penalties
    uint256 public nextDueTime;

    // Timestamp initialize was called
    uint256 public creationTime;

    // How much a user has contributed to loan during contribution phase
    mapping(address => uint256) public contributions;

    // How much a user has received payed back for their potion of contributing to the loan
    mapping(address => uint256) public compensations;

    // Event for when the single provider is established
    event SingleProvider(
        address singleProvider
    );

    // Event for when the loan payback is made
    event PaymentMade(
        uint256 paymentAmount,
        address paymentAddress
    );

    // Event for when the contributor gets refunded
    event RefundMade(
        uint256 refundAmount,
        address refundAddress
    );

    // Event for when the contributor claims funds
    event ClaimMade(
        uint256 claimAmount,
        address claimAddress
    );

    // Event for when the loan is liquidated or defaulted
    event Liquidated(
        address liquidatorAddress
    );

    // Event for when the interest rate is increased
    event PaymentRateIncrease(
        uint256 newRateIncrease
    );

    // Event for when the payback time is decreased
    event PaymentTimeDecrease(
        uint256 newPaymentTime
    );
}
