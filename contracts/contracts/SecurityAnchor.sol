// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SecurityAnchor {
  error NotOwner();
  error AlreadyAnchored(bytes32 auditId);

  address public owner;
  mapping(bytes32 => bytes32) public auditRoots;

  event AuditAnchored(
    bytes32 indexed auditId,
    bytes32 indexed merkleRoot,
    string uri,
    address indexed attester,
    uint256 timestamp
  );
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  constructor() {
    owner = msg.sender;
    emit OwnershipTransferred(address(0), msg.sender);
  }

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "zero address");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  function anchorAudit(bytes32 auditId, bytes32 merkleRoot, string calldata uri) external onlyOwner {
    if (auditRoots[auditId] != bytes32(0)) revert AlreadyAnchored(auditId);
    auditRoots[auditId] = merkleRoot;
    emit AuditAnchored(auditId, merkleRoot, uri, msg.sender, block.timestamp);
  }
}
