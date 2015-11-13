const BLOGPOSTS_PER_PAGE = 12;
let lastTumblrCheck;

const Posts = new Mongo.Collection("Posts");
const TumblrKey = Meteor.settings.TUMBLR_KEY;

Meteor.methods({
  checkTumblr() {
    // Only check once every minute
    if (new Date() - lastTumblrCheck < 60*1000)
      return;

    lastTumblrCheck = new Date();
    this.unblock();

    Meteor.http.get("http://api.tumblr.com/v2/blog/q42nl.tumblr.com/posts", {
      params: { api_key: TumblrKey, limit: 5 }
    }, (error, result) => {
      const count = result.data && result.data.response &&
                  result.data.response.posts &&
                  result.data.response.posts.length;
      if (result.statusCode == 200 && count) {
        console.log("Updating " + count + " from Tumblr.");
        for (let i = 0; i < count; i++)
          upsertPost(result.data.response.posts[i]);
      }
      else {
        if (count !== 0)
          console.log("Unexpected result:", result);
        if (error)
          console.log("Error:", error);
      }
    });
  },
  reimportTumblr(offset) {
    this.unblock();
    if (!offset) {
      Posts.remove({});
      offset = 0;
    }
    Meteor.http.get("http://api.tumblr.com/v2/blog/q42nl.tumblr.com/posts", {
      params: { api_key: TumblrKey, limit: 20, offset: offset }
    }, (error, result) => {
      const count = result.data && result.data.response &&
                  result.data.response.posts &&
                  result.data.response.posts.length;
      if (result.statusCode == 200 && count) {
        console.log("Importing " + count + " from Tumblr.");
        for (let i = 0; i < count; i++)
          upsertPost(result.data.response.posts[i]);
        Meteor.call("reimportTumblr", offset + 20);
      }
      else {
        if (count !== 0)
          console.log("Unexpected result:", result);
        if (error)
          console.log("Error:", error);
      }
    });
  },
  addComment(blogpostId, text) {
    check(text, String);

    BlogComments.insert({
      text: text,
      blogpostId: blogpostId,
      userName: Meteor.user().profile.name,
      userId: Meteor.userId(),
      date: new Date()
    });

    const token = ChatConfig.findOne().incomingToken;
    const url = "https://q42.slack.com/services/" +
              "hooks/incoming-webhook?token=" + token;
    const blogpostUrl = "http://q42.nl/blog/post/" + blogpostId;
    const formattedMsg = Meteor.user().profile.name +
                       " comment op het blog (" + blogpostUrl + "):";

    HTTP.post(url, {
      params: {
        payload: JSON.stringify({
          text: [formattedMsg, text].join("\n"),
          icon_emoji: ":earth_africa:"
        })
      }
    });
  },
  updateComment(_id, text) {
    BlogComments.update(commentSecurityFilter(_id), { $set: { text: text } });
  },
  deleteComment(_id) {
    BlogComments.remove(commentSecurityFilter(_id));
  }
});

function upsertPost(post) {
  post.prettyDate = post.date.substr(8, 2) + "-" +
                    post.date.substr(5, 2) + "-" + post.date.substr(0, 4);

  const employee = Employees.findOne({tumblr: post.post_author});
  post.authorName = employee ? employee.name : "Q42";

  if (post.body) {
    const pos = post.body.indexOf("<!-- more -->");
    post.intro = pos > -1 ? post.body.substring(0, pos) : post.body;
  }
  if (post.tags)
    post.tags = post.tags.map(function(s) { return s.toLowerCase(); });

  if (!Posts.findOne({ id: post.id }))
    Posts.insert(post);
  else
    Posts.update({ id: post.id }, post);
}

function commentSecurityFilter(_id) {
  return Meteor.user().isAdmin ?
    { _id: _id } : { _id: _id, userId: Meteor.userId() };
}

publishWithObserveChanges("blogpostIndex", (page, tag) => {
  page = page || 1;

  let filter = tag ? { tags: tag } : {};
  // if (tag.indexOf("!") === 0) {
  //   filter = {$ne: {tags: tag}};
  // }

  return Posts.find(filter, {
    limit: BLOGPOSTS_PER_PAGE,
    skip: (page - 1) * BLOGPOSTS_PER_PAGE,
    sort: { timestamp: -1 },
    fields: {
      intro: 1, id: 1, date: 1, slug: 1, title: 1, type: 1, url: 1,
      photos: 1, description: 1, caption: 1
    }
  });
});

publishWithObserveChanges("blogpostTitles", (page, tag) => {
  page = page || 1;
  const filter = tag ? { tags: tag } : {};
  return Posts.find(filter, {
    limit: BLOGPOSTS_PER_PAGE,
    skip: (page - 1) * BLOGPOSTS_PER_PAGE,
    sort: { timestamp: -1 },
    fields: {
      title: 1, slug: 1, id: 1, intro: 1, link_image: 1
    }
  });
});

publishWithObserveChanges("blogpostFull", (id) => {
  return Posts.find({ id: id }, {
    fields: {
      _id: 1, authorName: 1, body: 1,
      date: 1, id: 1, intro: 1,
      slug: 1, tags: 1, timestamp: 1, title: 1, type: 1,
      photos: 1, description: 1, caption: 1
    }
  });
});

// XXX: limit how much of the intro is sent to the client
Meteor.publish("postsWithAuthors", function(filter) {
  filter = filter || {};
  const posts = Posts.find({filter}, {sort: {date: -1}, limit: 3, fields: {
    title: 1, authorName: 1, slug: 1,
    intro: 1, prettyDate: 1, id: 1
  }}).map((rec) => {
    const author = Employees.findOne({name: rec.authorName});
    return {post: rec, author: author};
  });

  _.each(posts, (p) => {
    this.added("posts_with_authors", p.post._id, p);
  });

  this.ready();
});

Meteor.publish("pagesByTag", function(tag) {
  const self = this;
  const uuid = Meteor.uuid();
  let count = 0;
  let initializing = true;

  const filter = tag ? {tags: tag} : {};
  const handle = Posts.find(filter).observeChanges({
    added: function () {
      count++;
      if (!initializing)
        self.changed("PageCounts", uuid, {
          tag: tag,
          count: Math.ceil(count / BLOGPOSTS_PER_PAGE)
        });
    },
    removed: function () {
      count--;
      self.changed("PageCounts", uuid, {
        tag: tag,
        count: Math.ceil(count / BLOGPOSTS_PER_PAGE)
      });
    }
    // don't care about moved or changed
  });

  // Observe only returns after the initial added callbacks have
  // run. Now mark the subscription as ready.
  initializing = false;
  self.added("PageCounts", uuid, {
    tag: tag,
    count: Math.ceil(count / BLOGPOSTS_PER_PAGE)
  });
  self.ready();

  // stop observing the cursor when client unsubs
  self.onStop(function () {
    handle.stop();
  });
});

Meteor.publish("blogComments", (blogpostId) => {
  return BlogComments.find({ blogpostId: blogpostId });
});

if (Posts.find().count() === 0)
  Meteor.call("reimportTumblr");
