const path = require("path")

require("dotenv").config({ path: path.join(__dirname, "../.env.test") })

const { createDatabase, dropDatabase } = require("pg-god")
const { createConnection, getConnection } = require("typeorm")

const DB_HOST = process.env.DB_HOST
const DB_USERNAME = process.env.DB_USERNAME
const DB_PASSWORD = process.env.DB_PASSWORD
const DB_URL = `postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}`

const pgGodCredentials = {
  user: DB_USERNAME,
  password: DB_PASSWORD,
  host: DB_HOST,
}

class DatabaseFactory {
  constructor() {
    this.connection_ = null
    this.masterConnectionName = "master"
    this.templateDbName = "medusa-integration-template"
  }

  async createTemplateDb_({ cwd }) {
    try {
      // const cwd = path.resolve(path.join(__dirname, ".."))
      const connection = await this.getMasterConnection()
      const migrationDir = path.resolve(
        path.join(
          cwd,
          `node_modules`,
          `@medusajs`,
          `medusa`,
          `dist`,
          `migrations`,
          `*.js`
        )
      )

      const { getEnabledMigrations } = require(path.join(
        cwd,
        `node_modules`,
        `@medusajs`,
        `medusa`,
        `dist`,
        `commands`,
        `utils`,
        `get-migrations`
      ))

      // filter migrations to only include those that dont have feature flags
      const enabledMigrations = await getEnabledMigrations(
        [migrationDir],
        (flag) => false
      )

      await dropDatabase(
        {
          databaseName: this.templateDbName,
          errorIfNonExist: false,
        },
        pgGodCredentials
      )
      await createDatabase(
        { databaseName: this.templateDbName },
        pgGodCredentials
      )

      const templateDbConnection = await createConnection({
        type: "postgres",
        name: "templateConnection",
        url: `${DB_URL}/${this.templateDbName}`,
        migrations: enabledMigrations,
      })

      await templateDbConnection.runMigrations()
      await templateDbConnection.close()

      return connection
    } catch (err) {
      console.log("error in createTemplateDb_")
      console.log(err)
    }
  }

  async getMasterConnection() {
    try {
      return await getConnection(this.masterConnectionName)
    } catch (err) {
      return await this.createMasterConnection()
    }
  }

  async createMasterConnection() {
    const connection = await createConnection({
      type: "postgres",
      name: this.masterConnectionName,
      url: `${DB_URL}`,
    })

    return connection
  }

  async createFromTemplate(dbName) {
    const connection = await this.getMasterConnection()

    await connection.query(`DROP DATABASE IF EXISTS "${dbName}";`)
    await connection.query(
      `CREATE DATABASE "${dbName}" TEMPLATE "${this.templateDbName}";`
    )
  }

  async destroy() {
    const connection = await this.getMasterConnection()

    await connection.query(`DROP DATABASE IF EXISTS "${this.templateDbName}";`)
    await connection.close()
  }
}

module.exports = new DatabaseFactory()
