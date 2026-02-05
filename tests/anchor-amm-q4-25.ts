import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("anchor-amm-q4-25", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;

  const user = provider.wallet.publicKey;

  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;

  let configPda: anchor.web3.PublicKey;
  let mintLpPda: anchor.web3.PublicKey;
  let vaultXAta: anchor.web3.PublicKey;
  let vaultYAta: anchor.web3.PublicKey;
  let userXAta: anchor.web3.PublicKey;
  let userYAta: anchor.web3.PublicKey;
  let userLpAta: anchor.web3.PublicKey;

  const poolSeed = new anchor.BN(1111);
  const fee = 30; // 0.3%

  before(async () => {
    await provider.connection.requestAirdrop(
      user,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await new Promise((r) => setTimeout(r, 1000));

    mintX = await createMint(
      provider.connection,
      provider.wallet.payer,
      user,
      null,
      6
    );
    mintY = await createMint(
      provider.connection,
      provider.wallet.payer,
      user,
      null,
      6
    );

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config"), poolSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [mintLpPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    vaultXAta = getAssociatedTokenAddressSync(mintX, configPda, true);
    vaultYAta = getAssociatedTokenAddressSync(mintY, configPda, true);
    userXAta = getAssociatedTokenAddressSync(mintX, user);
    userYAta = getAssociatedTokenAddressSync(mintY, user);
    userLpAta = getAssociatedTokenAddressSync(mintLpPda, user);

    const tx = new anchor.web3.Transaction()
      .add(
        createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          userXAta,
          user,
          mintX
        )
      )
      .add(
        createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          userYAta,
          user,
          mintY
        )
      );
    await provider.sendAndConfirm(tx);

    await program.methods
      .initialize(poolSeed, fee, user)
      .accountsStrict({
        initializer: user,
        mintX,
        mintY,
        mintLp: mintLpPda,
        vaultX: vaultXAta,
        vaultY: vaultYAta,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintX,
      userXAta,
      provider.wallet.payer,
      1_000_000
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintY,
      userYAta,
      provider.wallet.payer,
      2_000_000
    );
  });

  it("Deposits liquidity and mints LP", async () => {
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintX,
      userXAta,
      provider.wallet.payer,
      1_000_000
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintY,
      userYAta,
      provider.wallet.payer,
      2_000_000
    );
    const amountLp = new anchor.BN(100_000);
    const maxX = new anchor.BN(100_000);
    const maxY = new anchor.BN(200_000);

    const beforeUserX = (
      await provider.connection.getTokenAccountBalance(userXAta)
    ).value.amount;
    const beforeUserY = (
      await provider.connection.getTokenAccountBalance(userYAta)
    ).value.amount;
    const beforeVaultX = (
      await provider.connection.getTokenAccountBalance(vaultXAta)
    ).value.amount;
    const beforeVaultY = (
      await provider.connection.getTokenAccountBalance(vaultYAta)
    ).value.amount;

    await program.methods
      .deposit(amountLp, maxX, maxY)
      .accountsStrict({
        user,
        mintX,
        mintY,
        config: configPda,
        mintLp: mintLpPda,
        vaultX: vaultXAta,
        vaultY: vaultYAta,
        userX: userXAta,
        userY: userYAta,
        userLp: userLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterUserX = (
      await provider.connection.getTokenAccountBalance(userXAta)
    ).value.amount;
    const afterUserY = (
      await provider.connection.getTokenAccountBalance(userYAta)
    ).value.amount;
    const afterVaultX = (
      await provider.connection.getTokenAccountBalance(vaultXAta)
    ).value.amount;
    const afterVaultY = (
      await provider.connection.getTokenAccountBalance(vaultYAta)
    ).value.amount;
    const userLp = (
      await provider.connection.getTokenAccountBalance(userLpAta)
    ).value.amount;

    const dUserX = BigInt(beforeUserX) - BigInt(afterUserX);
    const dUserY = BigInt(beforeUserY) - BigInt(afterUserY);
    const dVaultX = BigInt(afterVaultX) - BigInt(beforeVaultX);
    const dVaultY = BigInt(afterVaultY) - BigInt(beforeVaultY);

    if (dUserX !== dVaultX || dUserY !== dVaultY) {
      throw new Error(
        `Mismatch: userX ${dUserX} vs vaultX ${dVaultX}, userY ${dUserY} vs vaultY ${dVaultY}`
      );
    }

    if (
      dVaultX !== BigInt(maxX.toString()) ||
      dVaultY !== BigInt(maxY.toString())
    ) {
      throw new Error(
        `Expected first deposit to use maxX/maxY, got X=${dVaultX}, Y=${dVaultY}`
      );
    }

    if (BigInt(userLp) !== BigInt(amountLp.toString())) {
      throw new Error(
        `Expected user LP = ${amountLp.toString()}, got ${userLp}`
      );
    }
  });
  it("Withdraws liquidity and burns LP", async () => {
    const beforeUserX = (
      await provider.connection.getTokenAccountBalance(userXAta)
    ).value.amount;
    const beforeUserY = (
      await provider.connection.getTokenAccountBalance(userYAta)
    ).value.amount;
    const beforeVaultX = (
      await provider.connection.getTokenAccountBalance(vaultXAta)
    ).value.amount;
    const beforeVaultY = (
      await provider.connection.getTokenAccountBalance(vaultYAta)
    ).value.amount;
    const beforeUserLp = (
      await provider.connection.getTokenAccountBalance(userLpAta)
    ).value.amount;

    const beforeLpNum = parseInt(beforeUserLp);
    if (beforeLpNum === 0) {
      throw new Error("User has no LP tokens to withdraw");
    }

    const withdrawLpNum = Math.floor(beforeLpNum / 2);
    const minX = new anchor.BN(0);
    const minY = new anchor.BN(0);

    await program.methods
      .withdraw(new anchor.BN(withdrawLpNum), minX, minY)
      .accountsStrict({
        user,
        mintX,
        mintY,
        config: configPda,
        mintLp: mintLpPda,
        vaultX: vaultXAta,
        vaultY: vaultYAta,
        userX: userXAta,
        userY: userYAta,
        userLp: userLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterUserX = (
      await provider.connection.getTokenAccountBalance(userXAta)
    ).value.amount;
    const afterUserY = (
      await provider.connection.getTokenAccountBalance(userYAta)
    ).value.amount;
    const afterVaultX = (
      await provider.connection.getTokenAccountBalance(vaultXAta)
    ).value.amount;
    const afterVaultY = (
      await provider.connection.getTokenAccountBalance(vaultYAta)
    ).value.amount;
    const afterUserLp = (
      await provider.connection.getTokenAccountBalance(userLpAta)
    ).value.amount;

    const beforeLp = parseInt(beforeUserLp);
    const afterLp = parseInt(afterUserLp);
    if (afterLp !== beforeLp - withdrawLpNum) {
      throw new Error(
        `LP not burned correctly: before=${beforeLp}, withdrew=${withdrawLpNum}, after=${afterLp}`
      );
    }

    const beforeUserXNum = parseInt(beforeUserX);
    const beforeUserYNum = parseInt(beforeUserY);
    const beforeVaultXNum = parseInt(beforeVaultX);
    const beforeVaultYNum = parseInt(beforeVaultY);

    const beforeTotalX = beforeUserXNum + beforeVaultXNum;
    const beforeTotalY = beforeUserYNum + beforeVaultYNum;

    const afterUserXNum = parseInt(afterUserX);
    const afterUserYNum = parseInt(afterUserY);
    const afterVaultXNum = parseInt(afterVaultX);
    const afterVaultYNum = parseInt(afterVaultY);

    const afterTotalX = afterUserXNum + afterVaultXNum;
    const afterTotalY = afterUserYNum + afterVaultYNum;

    if (beforeTotalX !== afterTotalX) {
      throw new Error(
        `X not conserved: before=${beforeTotalX}, after=${afterTotalX}`
      );
    }
    if (beforeTotalY !== afterTotalY) {
      throw new Error(
        `Y not conserved: before=${beforeTotalY}, after=${afterTotalY}`
      );
    }

    if (afterUserXNum <= beforeUserXNum || afterUserYNum <= beforeUserYNum) {
      throw new Error(
        `User did not receive tokens back: userX ${beforeUserXNum}->${afterUserXNum}, userY ${beforeUserYNum}->${afterUserYNum}`
      );
    }

    console.log("✅ Withdraw successful!");
  });
  it("Swaps X for Y", async () => {
    // Mint more X to user for swapping
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintX,
      userXAta,
      provider.wallet.payer,
      100_000
    );

    const beforeUserX = parseInt(
      (await provider.connection.getTokenAccountBalance(userXAta)).value.amount
    );
    const beforeUserY = parseInt(
      (await provider.connection.getTokenAccountBalance(userYAta)).value.amount
    );
    const beforeVaultX = parseInt(
      (await provider.connection.getTokenAccountBalance(vaultXAta)).value.amount
    );
    const beforeVaultY = parseInt(
      (await provider.connection.getTokenAccountBalance(vaultYAta)).value.amount
    );

    const amountIn = new anchor.BN(10_000);
    const minOut = new anchor.BN(0);

    await program.methods
      .swap(true, amountIn, minOut)  // true = X→Y
      .accountsStrict({
        user,
        mintX,
        mintY,
        vaultX: vaultXAta,
        vaultY: vaultYAta,
        config: configPda,
        userX: userXAta,
        userY: userYAta,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    const afterUserX = parseInt(
      (await provider.connection.getTokenAccountBalance(userXAta)).value.amount
    );
    const afterUserY = parseInt(
      (await provider.connection.getTokenAccountBalance(userYAta)).value.amount
    );
    const afterVaultX = parseInt(
      (await provider.connection.getTokenAccountBalance(vaultXAta)).value.amount
    );
    const afterVaultY = parseInt(
      (await provider.connection.getTokenAccountBalance(vaultYAta)).value.amount
    );

    // User spent X and received Y
    if (afterUserX >= beforeUserX || afterUserY <= beforeUserY) {
      throw new Error(
        `Swap failed: userX ${beforeUserX}->${afterUserX}, userY ${beforeUserY}->${afterUserY}`
      );
    }

    // Vaults received X and sent Y
    if (afterVaultX <= beforeVaultX || afterVaultY >= beforeVaultY) {
      throw new Error(
        `Swap failed: vaultX ${beforeVaultX}->${afterVaultX}, vaultY ${beforeVaultY}->${afterVaultY}`
      );
    }

    // Conservation check
    const beforeTotalX = beforeUserX + beforeVaultX;
    const beforeTotalY = beforeUserY + beforeVaultY;
    const afterTotalX = afterUserX + afterVaultX;
    const afterTotalY = afterUserY + afterVaultY;

    if (beforeTotalX !== afterTotalX || beforeTotalY !== afterTotalY) {
      throw new Error(`Tokens not conserved!`);
    }

    console.log("✅ X→Y swap successful!");
  });
});
