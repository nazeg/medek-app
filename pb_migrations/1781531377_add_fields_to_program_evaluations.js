/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_evaluations");

  const fieldsToAdd = [
    new TextField({
      name: "program",
      type: "text",
      required: false,
      presentable: false
    }),
    new TextField({
      name: "term_key",
      type: "text",
      required: false,
      presentable: false
    }),
    new TextField({
      name: "opinion",
      type: "text",
      required: false,
      presentable: false
    }),
    new TextField({
      name: "evaluator_name",
      type: "text",
      required: false,
      presentable: false
    }),
    new TextField({
      name: "evaluator_title",
      type: "text",
      required: false,
      presentable: false
    }),
    new TextField({
      name: "evaluator_date",
      type: "text",
      required: false,
      presentable: false
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

  collection.listRule = "@request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.viewRule = "@request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.createRule = "@request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.updateRule = "@request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.deleteRule = "@request.auth.role = 'coordinator' || @request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
