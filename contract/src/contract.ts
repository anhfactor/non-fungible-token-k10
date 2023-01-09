import {
  NearBindgen,
  call,
  view,
  near,
  initialize,
  assert,
  NearPromise,
  PromiseOrValue
} from "near-sdk-js";
import { AccountId } from "near-sdk-js/lib/types";

import { NonFungibleToken } from "./impl";
import { Option, IntoStorageKey } from "./utils";
import {
  Token,
  TokenId,
} from "./token";
import { NonFungibleTokenApproval } from "./approval/index";

class StorageKey {}

class StorageKeyNonFungibleToken extends StorageKey implements IntoStorageKey {
  into_storage_key(): string {
    return "NFT_";
  }
}

@NearBindgen({ requireInit: true })
export class NftContract 
  implements
    NonFungibleTokenApproval
{
  tokens: NonFungibleToken;

  constructor() {
    this.tokens = new NonFungibleToken();
  } 

  @call({ payableFunction: true })
  nft_approve({
    token_id,
    account_id,
    msg,
  }: {
    token_id: string;
    account_id: string;
    msg?: string;
  }): Option<NearPromise> {
    return this.tokens.nft_approve({ token_id, account_id, msg });
  }

  @call({ payableFunction: true })
  nft_revoke({
    token_id,
    account_id,
  }: {
    token_id: string;
    account_id: string;
  }) {
    return this.tokens.nft_revoke({ token_id, account_id });
  }

  @call({ payableFunction: true })
  nft_revoke_all({ token_id }: { token_id: string }) {
    return this.tokens.nft_revoke_all({ token_id });
  }

  @view({})
  nft_is_approved({
    token_id,
    approved_account_id,
    approval_id,
  }: {
    token_id: string;
    approved_account_id: string;
    approval_id?: bigint;
  }): boolean {
    return this.tokens.nft_is_approved({
      token_id,
      approved_account_id,
      approval_id,
    });
  }

  @call({ payableFunction: true })
  nft_transfer({
    receiver_id,
    token_id,
    approval_id,
    memo,
  }: {
    receiver_id: string;
    token_id: string;
    approval_id?: bigint;
    memo?: string;
  }) {
    this.tokens.nft_transfer({ receiver_id, token_id, approval_id, memo });
  }

  @call({ payableFunction: true })
  nft_transfer_call({
    receiver_id,
    token_id,
    approval_id,
    memo,
    msg,
  }: {
    receiver_id: string;
    token_id: string;
    approval_id?: bigint;
    memo?: string;
    msg: string;
  }): PromiseOrValue<boolean> {
    return this.tokens.nft_transfer_call({
      receiver_id,
      token_id,
      approval_id,
      memo,
      msg,
    });
  }

  @view({})
  nft_token({ token_id }: { token_id: string }): Option<Token> {
    return this.tokens.nft_token({ token_id });
  }

  @initialize({ requireInit: true })
  init({
    owner_id
  }: {
    owner_id: string;
  }) {
    this.tokens = new NonFungibleToken();
    this.tokens.init(
      new StorageKeyNonFungibleToken(),
      owner_id
    );
  }

  @call({ payableFunction: true })
  nft_mint({
    token_id,
    token_owner_id
  }: {
    token_id: TokenId;
    token_owner_id: AccountId;
  }) {
    assert(
      near.predecessorAccountId() === this.tokens.owner_id,
      "Unauthorized"
    );
    this.tokens.internal_mint(token_id, token_owner_id);
  }
}