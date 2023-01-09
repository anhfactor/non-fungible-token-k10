export type Option<T> = T | null;

export interface IntoStorageKey {
    into_storage_key(): string;
}