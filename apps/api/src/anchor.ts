import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from "ethers";

const ANCHOR_ABI = [
  "function anchorAudit(bytes32 auditId, bytes32 merkleRoot, string uri) external",
  "event AuditAnchored(bytes32 indexed auditId, bytes32 indexed merkleRoot, string uri, address indexed attester, uint256 timestamp)"
];

export interface AnchorConfig {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
  chainId?: number;
}

export interface AnchorTxResult {
  txHash: string;
  chainId: number;
  contractAddress: string;
  auditIdHash: string;
  merkleRoot: string;
  uri: string;
  blockTimestamp?: number;
}

export async function anchorAuditOnChain(
  config: AnchorConfig,
  auditId: string,
  merkleRoot: string,
  uri: string
): Promise<AnchorTxResult> {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new Wallet(config.privateKey, provider);
  const contract = new Contract(config.contractAddress, ANCHOR_ABI, wallet);

  const auditIdHash = keccak256(toUtf8Bytes(auditId));
  const tx = await contract.anchorAudit(auditIdHash, merkleRoot, uri);
  const receipt = await tx.wait();

  let blockTimestamp: number | undefined;
  if (receipt?.blockNumber) {
    const block = await provider.getBlock(receipt.blockNumber);
    blockTimestamp = block?.timestamp;
  }

  const chain = await provider.getNetwork();

  return {
    txHash: receipt?.hash ?? tx.hash,
    chainId: Number(chain.chainId),
    contractAddress: config.contractAddress,
    auditIdHash,
    merkleRoot,
    uri,
    blockTimestamp
  };
}
