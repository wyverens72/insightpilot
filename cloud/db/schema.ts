import {sqliteTable, text, integer} from "drizzle-orm/sqlite-core";
export const documents = sqliteTable("workspace_documents", {id:text("id").primaryKey(), owner:text("owner").notNull(), kind:text("kind").notNull(), created:text("created").notNull(), value:text("value").notNull(), leaseUntil:integer("lease_until").notNull().default(0)});
export const quotas = sqliteTable("daily_quotas",{id:text("id").primaryKey(),count:integer("count").notNull().default(0)});
