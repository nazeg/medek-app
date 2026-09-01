/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const collection = app.findCollectionByNameOrId("logs");
    collection.listRule = "@request.auth.id != ''";
    collection.viewRule = "@request.auth.id != ''";
    collection.createRule = "";
    collection.deleteRule = "@request.auth.id != ''";
    collection.updateRule = null;
    return app.save(collection);
  } catch (e) {
    const snapshot = [
      {
        "id": "pbc_logs_audit_table",
        "name": "logs",
        "type": "base",
        "system": false,
        "listRule": "@request.auth.id != ''",
        "viewRule": "@request.auth.id != ''",
        "createRule": "",
        "updateRule": null,
        "deleteRule": "@request.auth.id != ''",
        "indexes": [],
        "fields": [
          {
            "autogeneratePattern": "[a-z0-9]{15}",
            "help": "",
            "hidden": false,
            "id": "text3208210256",
            "max": 15,
            "min": 15,
            "name": "id",
            "pattern": "^[a-z0-9]+$",
            "presentable": false,
            "primaryKey": true,
            "required": true,
            "system": true,
            "type": "text"
          },
          {
            "autogeneratePattern": "",
            "help": "",
            "hidden": false,
            "id": "text_log_username",
            "max": 0,
            "min": 0,
            "name": "user_name",
            "pattern": "",
            "presentable": true,
            "primaryKey": false,
            "required": false,
            "system": false,
            "type": "text"
          },
          {
            "autogeneratePattern": "",
            "help": "",
            "hidden": false,
            "id": "text_log_userrole",
            "max": 0,
            "min": 0,
            "name": "user_role",
            "pattern": "",
            "presentable": false,
            "primaryKey": false,
            "required": false,
            "system": false,
            "type": "text"
          },
          {
            "autogeneratePattern": "",
            "help": "",
            "hidden": false,
            "id": "text_log_action",
            "max": 0,
            "min": 0,
            "name": "action",
            "pattern": "",
            "presentable": false,
            "primaryKey": false,
            "required": false,
            "system": false,
            "type": "text"
          },
          {
            "autogeneratePattern": "",
            "help": "",
            "hidden": false,
            "id": "text_log_category",
            "max": 0,
            "min": 0,
            "name": "category",
            "pattern": "",
            "presentable": false,
            "primaryKey": false,
            "required": false,
            "system": false,
            "type": "text"
          },
          {
            "autogeneratePattern": "",
            "help": "",
            "hidden": false,
            "id": "text_log_details",
            "max": 0,
            "min": 0,
            "name": "details",
            "pattern": "",
            "presentable": false,
            "primaryKey": false,
            "required": false,
            "system": false,
            "type": "text"
          },
          {
            "hidden": false,
            "id": "json_log_metadata",
            "maxSize": 0,
            "name": "metadata",
            "presentable": false,
            "required": false,
            "system": false,
            "type": "json"
          },
          {
            "cascadeDelete": false,
            "collectionId": "_pb_users_auth_",
            "help": "",
            "hidden": false,
            "id": "relation_log_user",
            "maxSelect": 1,
            "minSelect": 0,
            "name": "user",
            "presentable": false,
            "required": false,
            "system": false,
            "type": "relation"
          }
        ]
      }
    ];

    return app.importCollections(snapshot, false);
  }
}, (app) => {
  return null;
});
