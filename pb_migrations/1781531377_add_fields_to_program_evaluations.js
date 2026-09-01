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

  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin' || @request.auth.role = 'coordinator'";
  collection.updateRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin' || @request.auth.role = 'coordinator'";
  collection.deleteRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
