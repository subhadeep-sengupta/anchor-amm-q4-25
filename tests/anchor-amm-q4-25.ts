import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createMint, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("anchor-amm-q4-25", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;

  const user = provider.wallet.publicKey;
  const admin = anchor.web3.Keypair.generate();

  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;
  let userXAta: anchor.web3.PublicKey;
  let userYAta: anchor.web3.PublicKey;
  let vaultXAta: anchor.web3.PublicKey;
  let vaultYAta: anchor.web3.PublicKey;
  let userLpAta: anchor.web3.PublicKey;

  // PDAs
  let configPda: anchor.web3.PublicKey;
  let configBump: number;
  let mintLpPda: anchor.web3.PublicKey;
  let mintLpBump: number;

  const seeds = new anchor.BN(1234);


  before(async () => {
    await provider.connection.requestAirdrop(user, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    mintX = await createMint(provider.connection, provider.wallet.payer, user, null, 0);
    mintY = await createMint(provider.connection, provider.wallet.payer, user, null, 0)
  })
});
