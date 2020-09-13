import { FilterDefinition } from "../../api";

export type NameAndPK = { pk: string | number; name: string };

export type Metadata = { label: string; value: string | number };
export const defaultResponse = [{ label: "none", value: "none" }];

export const defaultFilter: FilterDefinition = {
  sourceSystemIds: [],
  tags: [],
};

export function mapToMetadata<T extends NameAndPK>(meta: T): Metadata {
  return { label: meta.name, value: meta.pk };
}
