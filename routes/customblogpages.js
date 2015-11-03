customBlogPages = (router) => {

  customPageWithBlogTags = (obj) => {
    if (Meteor.isClient) {
      const templateName = RouteUtils.getTemplate(obj.routeName);
      const tmpl = Template[templateName];
      if (tmpl) {
        tmpl.helpers({
          post: () => blogpostIndex.find()
        });
      }
    }
    FlowRouter.route(obj.path, {
      name: obj.routeName,
      triggersEnter: [() => Meteor.call("checkTumblr")],
      action() {
        BlazeLayout.render("main", {
          header: "header",
          footer: "footer",
          body: RouteUtils.getTemplate(obj.routeName)
        });
      },
      subscriptions() {
        this.register("posts",
          Meteor.subscribe("blogpostIndex", 1, obj.tags[0]));
      }
    });
  };

  customPageWithBlogTags({
    routeName: "meteor",
    path: "/meteor",
    tags: ["meteor"]
  });

  customPageWithBlogTags({
    routeName: "swift",
    path: "/swift",
    tags: ["swift"]
  });

  customPageWithBlogTags({
    routeName: "vacatures",
    path: "/vacatures",
    tags: ["vacature"]
  });

  customPageWithBlogTags({
    routeName: "io",
    path: "/io",
    tags: ["io"]
  });

};
