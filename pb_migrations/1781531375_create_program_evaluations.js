/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const existing = app.findCollectionByNameOrId("program_evaluations");
    if (existing) {
      existing.listRule = "@request.auth.id != ''";
      existing.viewRule = "@request.auth.id != ''";
      existing.createRule = "@request.auth.id != ''";
      existing.updateRule = "@request.auth.id != ''";
      existing.deleteRule = "@request.auth.id != ''";
      return app.save(existing);
    }
  } catch (e) {
    // not exists, will create
  }

  const collection = new Collection({
    name: "program_evaluations",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
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
    ]
  });

  return app.save(collection);
}, (app) => {
  return null;
});
