/**
 * @module db
 */

import * as Knex from "knex";
import * as _ from "lodash";

import { IS_DEVELOPMENT, IS_PRODUCTION } from "../node_env";

const DB_HOST: string = _.defaultTo<string>(process.env.DB_HOST, "localhost");
const DB_PORT: string = _.defaultTo<string>(process.env.DB_PORT, "5432");
const DB_USER: string = _.defaultTo<string>(process.env.DB_USER, "postgres");
const DB_PASS: string = _.defaultTo<string>(process.env.DB_PASS, "postgres");
const DB_NAME: string = _.defaultTo<string>(process.env.DB_NAME, "postgres");


export const TEAMS_TABLE = "teams";
export const SUBMISSIONS_TABLE = "submissions";
export const GAMES_TABLE = "games";
export const GAMES_SUBMISSIONS_TABLE = "games_submissions"

export const TEAM_SUBMISSIONS_STATUSES = ["queued", "building", "finished", "failed"];
export const GAME_STATUSES = ["queued", "playing", "finished", "failed"];

/**
 * Main Knex connection. Make queries though this using the Knex API.
 */
export const connection = (IS_DEVELOPMENT ? buildDevelopmentConnection() : buildProductionConnection());

function buildDevelopmentConnection(): Knex {
    return Knex({
        client: "sqlite3",
        connection: {
            filename: "./db.sqlite",
        }
    });
}

function buildProductionConnection(): Knex {
    return Knex({
        client: "postgresql",
        connection: {
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASS,
            database: DB_NAME
        }
    });
}

/**
 * Initializes the database with Colisee tables
 * @param force - Allow function to initialize a production database
 */
export async function initializeDatabase(force: boolean = false): Promise<string> {
    if (IS_PRODUCTION && !force) throw new Error("Cannot initialize database on production unless force=true.");

    // Drop All Tables
    const dropAll = [
        TEAMS_TABLE,
        SUBMISSIONS_TABLE,
        GAMES_TABLE,
        GAMES_SUBMISSIONS_TABLE
    ].map(table => connection.schema.dropTableIfExists(table));
    await Promise.all(dropAll);

    // Create All Tables
    const tables = [
        connection.schema.createTable(TEAMS_TABLE, table => {
            table.increments("id");
            table.string("name", 64)
                .notNullable()
                .unique();

            table.string("contact_email", 64)
                .notNullable()
                .unique();
            table.string("password", 256)
                .notNullable();
            table.boolean("is_eligible")
                .notNullable();

            table.timestamps(true, true);
        }),

        connection.schema.createTable(SUBMISSIONS_TABLE, table => {
            table.increments("id");
            table.integer("team_id")
                .unsigned()
                .references(`${TEAMS_TABLE}.id`);

            table.integer("version").notNullable();
            table.enu("status", TEAM_SUBMISSIONS_STATUSES).notNullable();

            table.string("submission_url");
            table.string("log_url");
            table.string("image_name")
                .comment("The docker image of the submission contained on the Arena Docker Registry");

            table.timestamps(true, true);

            // Constraints
            table.unique(["team_id", "version"]);
        }),

        connection.schema.createTable(GAMES_TABLE, table => {
            table.increments("id");
            table.enu("status", GAME_STATUSES);

            table.string("win_reason");
            table.string("lose_reason");
            table.integer("winner_id")
                .unsigned()
                .references(`${SUBMISSIONS_TABLE}.id`)
                .comment("The id of the winning submission");

            table.string("log_url")
                .comment("Link to the game log.");

            table.timestamps(true, true);
        }),

        connection.schema.createTable(GAMES_SUBMISSIONS_TABLE, table => {
            table.increments("id");

            table.integer("submission_id")
                .unsigned()
                .notNullable()
                .references(`${SUBMISSIONS_TABLE}.id`)
                .comment("The submission that is a player in the linked game.");

            table.integer("game_id")
                .unsigned()
                .notNullable()
                .references(`${GAMES_TABLE}.id`)
                .comment("The game that is/was played by the linked player.");

            table.string("output_url")
                .comment("Link to the output generated by the linked submission.");

            table.timestamps(true, true);
        })
    ]

    return tables.map(t => t.toString()).join(";");
}

