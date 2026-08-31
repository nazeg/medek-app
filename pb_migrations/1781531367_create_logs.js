/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const usersCollection = app.findCollectionByNameOrId("users");

  const collection = new Collection({
    name: "logs",
    type: "base",
    createRule: "",
    listRule: "@request.auth.role = 'admin'",
    viewRule: "@request.auth.role = 'admin'",
    updateRule: null,
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      new TextField({
        name: "user_name",
        type: "text",
        required: false,
        presentable: true
      }),
      new TextField({
        name: "user_role",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "action",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "category",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "details",
        type: "text",
        required: false,
        presentable: false
      }),
      new JSONField({
        name: "metadata",
        type: "json",
        required: false,
        presentable: false
      }),
      new RelationField({
        name: "user",
        type: "relation",
        required: false,
        presentable: false,
        cascadeDelete: false,
        collectionId: usersCollection.id,
        maxSelect: 1
      })
    ]
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("logs");
    return app.delete(collection);
  } catch (e) {
    return;
  }
});
