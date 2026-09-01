/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("logs");
  const usersCollection = app.findCollectionByNameOrId("users");

  const fieldsToAdd = [
    new TextField({
      name: "user_name",
      type: "text",
      required: false,
      presentable: true
    }),
    new TextField({
      name: "user_role",
      type: "text",
      required: false
    }),
    new TextField({
      name: "action",
      type: "text",
      required: false
    }),
    new TextField({
      name: "category",
      type: "text",
      required: false
    }),
    new TextField({
      name: "details",
      type: "text",
      required: false
    }),
    new JSONField({
      name: "metadata",
      type: "json",
      required: false
    }),
    new RelationField({
      name: "user",
      type: "relation",
      required: false,
      collectionId: usersCollection ? usersCollection.id : "_pb_users_auth_",
      maxSelect: 1
    })
  ];

  fieldsToAdd.forEach(field => {
    try {
      if (!collection.fields.getByName(field.name)) {
        collection.fields.add(field);
      }
    } catch (e) {
      collection.fields.add(field);
    }
  });

  collection.listRule = "@request.auth.role = 'admin'";
  collection.viewRule = "@request.auth.role = 'admin'";
  collection.createRule = "";
  collection.deleteRule = "@request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
