import {
    UnorderedMap,
    LookupMap,
    near,
    UnorderedSet,
    assert,
    NearPromise,
    bytes
  } from "near-sdk-js";
  import { AccountId } from "near-sdk-js/lib/types";
  import { Token, TokenId } from "./token";
  import { NonFungibleTokenApproval } from "./approval";
  import { Option, IntoStorageKey } from "./utils";
  import { NftMint, NftTransfer } from "./events";

  const GAS_FOR_RESOLVE_TRANSFER = 15000000000000n;
  const GAS_FOR_NFT_TRANSFER_CALL = 30000000000000n + GAS_FOR_RESOLVE_TRANSFER;
  const GAS_FOR_NFT_APPROVE = 20000000000000n;
  
  function expect_token_found<T>(option: Option<T>): T {
    if (option === null) {
      throw new Error("Token not found");
    }
    return option;
  }
  
  function expect_approval<T>(option: Option<T>): T {
    if (option === null) {
      throw new Error("next_approval_by_id must be set for approval ext");
    }
    return option;
  }
  
  /** Implementation of the non-fungible token standard.
   * Allows to include NEP-171 compatible token to any contract.
   */
  export class NonFungibleToken
    implements
      NonFungibleTokenApproval
  {
    public owner_id: AccountId;
    public owner_by_id: UnorderedMap;
    public approvals_by_id: Option<LookupMap>;
    public next_approval_id_by_id: Option<LookupMap>;
  
    constructor() {
      this.owner_id = "";
      this.owner_by_id = new UnorderedMap("");
      this.approvals_by_id = null;
      this.next_approval_id_by_id = null;
    }

    nft_approve({
      token_id,
      account_id,
      msg,
    }: {
      token_id: TokenId;
      account_id: AccountId;
      msg: string;
    }): Option<NearPromise> {
      if (this.approvals_by_id === null) {
        throw new Error("NFT does not support Approval Management");
      }
      const approvals_by_id = this.approvals_by_id;
      const owner_id = expect_token_found(this.owner_by_id.get(token_id));
  
      assert(
        near.predecessorAccountId() === owner_id,
        "Predecessor must be token owner."
      );
  
      const next_approval_id_by_id = expect_approval(this.next_approval_id_by_id);
      const approved_account_ids: any = approvals_by_id.get(token_id) ?? {};
      const approval_id: any = next_approval_id_by_id.get(token_id) ?? 1;
      const old_approved_account_ids_size = approved_account_ids.length;
      approved_account_ids[account_id] = approval_id;
      const new_approved_account_ids_size = approved_account_ids.length;
  
      approvals_by_id.set(token_id, approved_account_ids);
  
      next_approval_id_by_id.set(token_id, approval_id + 1);
  
      const storage_used =
        new_approved_account_ids_size - old_approved_account_ids_size;
  
      if (msg) {
        return NearPromise.new(account_id).functionCall(
          "nft_on_approve",
          JSON.stringify({ token_id, owner_id, approval_id, msg }),
          0n,
          near.prepaidGas() - GAS_FOR_NFT_APPROVE
        );
      }
      return null;
    }
  
    nft_revoke({
      token_id,
      account_id,
    }: {
      token_id: TokenId;
      account_id: AccountId;
    }) {
      if (this.approvals_by_id === null) {
        throw new Error("NFT does not support Approval Management");
      }
      const approvals_by_id = this.approvals_by_id;
      const owner_id = expect_token_found(this.owner_by_id.get(token_id));
  
      const predecessorAccountId = near.predecessorAccountId();
      assert(
        predecessorAccountId === owner_id,
        "Predecessor must be token owner."
      );
  
      const approved_account_ids: any = approvals_by_id.get(token_id);
      const old_approved_account_ids_size = approved_account_ids.length;
      let new_approved_account_ids_size;
  
      if (approved_account_ids[account_id]) {
        delete approved_account_ids[account_id];
        if (Object.keys(approved_account_ids).length === 0) {
          approvals_by_id.remove(token_id);
          new_approved_account_ids_size = approved_account_ids.length;
        } else {
          approvals_by_id.set(token_id, approved_account_ids);
          new_approved_account_ids_size = 0;
        }
      }
    }
  
    nft_revoke_all({ token_id }: { token_id: TokenId }) {
      if (this.approvals_by_id === null) {
        throw new Error("NFT does not support Approval Management");
      }
      const approvals_by_id = this.approvals_by_id;
      const owner_id = expect_token_found(this.owner_by_id.get(token_id));
  
      const predecessorAccountId = near.predecessorAccountId();
      assert(
        predecessorAccountId === owner_id,
        "Predecessor must be token owner."
      );
  
      const approved_account_ids = approvals_by_id.get(token_id);
      if (approved_account_ids) {
        approvals_by_id.remove(token_id);
      }
    }
  
    nft_is_approved({
      token_id,
      approved_account_id,
      approval_id,
    }: {
      token_id: TokenId;
      approved_account_id: AccountId;
      approval_id?: bigint;
    }): boolean {
      expect_token_found(this.owner_by_id.get(token_id));
  
      if (this.approvals_by_id === null) {
        return false;
      }
      const approvals_by_id = this.approvals_by_id;
  
      const approved_account_ids = approvals_by_id.get(token_id);
      if (approved_account_ids === null) {
        return false;
      }
  
      const actual_approval_id = approved_account_ids[approved_account_id];
      if (actual_approval_id === undefined) {
        return false;
      }
  
      if (approval_id) {
        return BigInt(approval_id) === actual_approval_id;
      }
      return true;
    }
  
    init(
      owner_by_id_prefix: IntoStorageKey,
      owner_id: AccountId,
      approval_prefix?: IntoStorageKey
    ) {
      let approvals_by_id: Option<LookupMap>;
      let next_approval_id_by_id: Option<LookupMap>;
      if (approval_prefix) {
        const prefix = approval_prefix.into_storage_key();
        approvals_by_id = new LookupMap(prefix);
        next_approval_id_by_id = new LookupMap(prefix + "n");
      } else {
        approvals_by_id = null;
        next_approval_id_by_id = null;
      }
  
      this.owner_id = owner_id;
      this.owner_by_id = new UnorderedMap(
        owner_by_id_prefix.into_storage_key()
      );
      this.approvals_by_id = approvals_by_id;
      this.next_approval_id_by_id = next_approval_id_by_id;
    }
  
    static reconstruct(data: NonFungibleToken): NonFungibleToken {
      const ret = new NonFungibleToken();
      Object.assign(ret, data);
      return ret;
    }
  
    internal_transfer_unguarded(
      token_id: TokenId,
      from: AccountId,
      to: AccountId
    ) {
      this.owner_by_id.set(token_id, to);
    }
  
    internal_transfer(
      sender_id: AccountId,
      receiver_id: AccountId,
      token_id: TokenId,
      approval_id?: bigint,
      memo?: string
    ): [AccountId, Option<{ [approvals: AccountId]: bigint }>] {
      const owner_id:any = this.owner_by_id.get(token_id);
      if (owner_id == null) {
        throw new Error("Token not found");
      }
  
      const approved_account_ids: any = this.approvals_by_id?.remove(token_id);
  
      let sender_id_authorized: string | undefined;
      if (sender_id != owner_id) {
        if (!approved_account_ids) {
          throw new Error("Unauthorized");
        }
  
        const actual_approval_id = approved_account_ids[sender_id];
        if (!actual_approval_id) {
          throw new Error("Sender not approved");
        }
  
        assert(
          approval_id === undefined || approval_id == actual_approval_id,
          `The actual approval_id ${actual_approval_id} is different from the given ${approval_id}`
        );
        sender_id_authorized = sender_id;
      } else {
        sender_id_authorized = undefined;
      }
      assert(owner_id != receiver_id, "Current and next owner must differ");
      this.internal_transfer_unguarded(token_id, owner_id, receiver_id);
      NonFungibleToken.emit_transfer(
        owner_id,
        receiver_id,
        token_id,
        sender_id_authorized,
        memo
      );
      return [owner_id, approved_account_ids];
    }
  
    static emit_transfer(
      owner_id: AccountId,
      receiver_id: AccountId,
      token_id: TokenId,
      sender_id?: AccountId,
      memo?: string
    ) {
      new NftTransfer(
        owner_id,
        receiver_id,
        [token_id],
        sender_id && sender_id == owner_id ? sender_id : undefined,
        memo
      ).emit();
    }
  
    internal_mint(
      token_id: TokenId,
      token_owner_id: AccountId,
    ): Token {
      const token = this.internal_mint_with_refund(
        token_id,
        token_owner_id,
        near.predecessorAccountId()
      );
      new NftMint(token.owner_id, [token.token_id]).emit();
      return token;
    }
  
    internal_mint_with_refund(
      token_id: TokenId,
      token_owner_id: AccountId,
      refund_id?: string
    ): Token {
      let initial_storage_usage: Option<[string, bigint]> = null;
      if (this.owner_by_id.get(token_id)) {
        throw new Error("token_id must be unique");
      }
  
      const owner_id = token_owner_id;
      this.owner_by_id.set(token_id, owner_id);

      const approved_account_ids = this.approvals_by_id ? {} : undefined;
      if (initial_storage_usage) {
        const [id, storage_usage] = initial_storage_usage;
      }
      return new Token(token_id, owner_id, approved_account_ids);
    }
  
    nft_transfer({
      receiver_id,
      token_id,
      approval_id,
      memo,
    }: {
      receiver_id: AccountId;
      token_id: TokenId;
      approval_id?: bigint;
      memo?: string;
    }) {
      const sender_id = near.predecessorAccountId();
      this.internal_transfer(sender_id, receiver_id, token_id, approval_id, memo);
    }
  
    nft_transfer_call({
      receiver_id,
      token_id,
      approval_id,
      memo,
      msg,
    }: {
      receiver_id: AccountId;
      token_id: TokenId;
      approval_id?: bigint;
      memo?: string;
      msg: string;
    }) {
      assert(
        near.prepaidGas() > GAS_FOR_NFT_TRANSFER_CALL,
        "Not enough prepaid gas"
      );
      const sender_id = near.predecessorAccountId();
      const [previous_owner_id, approved_account_ids] = this.internal_transfer(
        sender_id,
        receiver_id,
        token_id,
        approval_id,
        memo
      );
  
      const promise = NearPromise.new(receiver_id)
        .functionCall(
          "nft_on_transfer",
          JSON.stringify({ sender_id, previous_owner_id, token_id, msg }),
          0n,
          near.prepaidGas() - GAS_FOR_NFT_TRANSFER_CALL
        )
        .then(
          NearPromise.new(near.currentAccountId()).functionCall(
            "nft_resolve_transfer",
              JSON.stringify({
                previous_owner_id,
                receiver_id,
                token_id,
                approved_account_ids,
              }),
            0n,
            GAS_FOR_RESOLVE_TRANSFER
          )
        );
      return promise;
    }
  
    nft_token({ token_id }: { token_id: TokenId }): Option<Token> {
      const owner_id:any = this.owner_by_id.get(token_id);
      if (owner_id == null) {
        return null;
      }
      const approved_account_ids = this.approvals_by_id?.get(token_id) as Option<{
        [approvals: AccountId]: bigint;
      }>;
      return new Token(token_id, owner_id, approved_account_ids);
    }
  
    nft_resolve_transfer({
      previous_owner_id,
      receiver_id,
      token_id,
      approved_account_ids,
    }: {
      previous_owner_id: AccountId;
      receiver_id: AccountId;
      token_id: TokenId;
      approved_account_ids?: { [approvals: AccountId]: bigint };
    }): boolean {
      let must_revert = false;
      let p: string;
      try {
        p = near.promiseResult(0);
      } catch (e) {
        if (e.message.includes("Not Ready")) {
          throw new Error();
        } else {
          must_revert = true;
        }
      }
      if (!must_revert) {
        try {
          const yes_or_no = JSON.parse(p);
          if (typeof yes_or_no == "boolean") {
            must_revert = yes_or_no;
          } else {
            must_revert = true;
          }
        } catch (_e) {
          must_revert = true;
        }
      }
  
      if (!must_revert) {
        return true;
      }
  
      const current_owner = this.owner_by_id.get(token_id) as Option<AccountId>;
      if (current_owner) {
        if (current_owner != receiver_id) {
          return true;
        }
      }
  
      this.internal_transfer_unguarded(token_id, receiver_id, previous_owner_id);
  
      if (this.approvals_by_id) {
        const receiver_approvals = this.approvals_by_id.get(token_id);
        if (approved_account_ids) {
          this.approvals_by_id.set(token_id, approved_account_ids);
        }
      }
      NonFungibleToken.emit_transfer(
        receiver_id,
        previous_owner_id,
        token_id,
        null,
        null
      );
      return false;
    }
  }