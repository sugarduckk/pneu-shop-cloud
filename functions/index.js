const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
const increment = admin.firestore.FieldValue.increment;
const app = admin.initializeApp();
const fs = app.firestore();
const auth = app.auth();
const storage = app.storage();

const algoliasearch = require('algoliasearch');
const env = functions.config();

const ALGOLIA_ID = env.algolia.app_id;
const ALGOLIA_ADMIN_KEY = env.algolia.api_key;
const ALGOLIA_SEARCH_KEY = env.algolia.search_key;
const ALGOLIA_INDEX_NAME = 'products';
const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);

exports.createUserDoc = functions.auth.user().onCreate(user => {
  return fs.collection('users').doc(user.uid).set({
    createdTimestamp: serverTimestamp
  });
});

exports.deleteUserDoc = functions.auth.user().onDelete(user => {
  const batch = fs.batch();
  batch.delete(fs.collection('users').doc(user.uid));
  batch.delete(fs.collection('roles').doc(user.uid));
  return batch.commit();
});

exports.updateEmailVerified = functions.https.onCall((data, context) => {
  const { uid } = data;
  return fs.collection('users').doc(uid).set({
    emailVerified: true,
    emailVerifiedTimestamp: serverTimestamp
  }, {
    merge: true
  });
});

exports.createUserWithRole = functions.https.onCall((data, context) => {
  const { email, password, role } = data;
  const claims = {
    role
  };
  var uid;
  return auth.createUser({
    email,
    emailVerified: true,
    password
  })
    .then(userRecord => {
      uid = userRecord.uid;
      return auth.setCustomUserClaims(uid, claims);
    })
    .then(() => {
      return fs.collection('roles').doc(uid).set({
        email,
        role,
        createdTimestamp: serverTimestamp
      });
    });
});

exports.deleteUserWithRole = functions.https.onCall((data, context) => {
  const { uid } = data;
  return auth.deleteUser(uid);
});

exports.editUserRole = functions.https.onCall((data, context) => {
  const { uid, role } = data;
  const claims = {
    role
  };
  return auth.setCustomUserClaims(uid, claims)
    .then(() => {
      return fs.collection('roles').doc(uid).update({
        role
      });
    });
});

exports.addUserRoleByEmail = functions.https.onCall((data, context) => {
  const { email, role } = data;
  const claims = {
    role
  };
  var uid;
  return auth.getUserByEmail(email)
    .then(user => {
      uid = user.uid;
      return auth.setCustomUserClaims(uid, claims);
    })
    .then(() => {
      return fs.collection('roles').doc(uid).set({
        email,
        role,
        createdTimestamp: serverTimestamp
      }, {
        merge: true
      });
    });
});

exports.indexProduct = functions.firestore.document('products/{productId}').onCreate((snap, context) => {
  const product = snap.data();
  product.objectID = context.params.productId;
  const index = client.initIndex(ALGOLIA_INDEX_NAME);
  return index.saveObject(product);
});

exports.reindexProduct = functions.firestore.document('products/{productId}').onUpdate((change, context) => {
  const product = change.after.data();
  product.objectID = context.params.productId;
  const index = client.initIndex(ALGOLIA_INDEX_NAME);
  return index.saveObject(product);
});

exports.unindexProduct = functions.firestore.document('products/{productId}').onDelete((snap, context) => {
  const index = client.initIndex(ALGOLIA_INDEX_NAME);
  return index.deleteObject(context.params.productId);
});

exports.deleteProductImages = functions.firestore.document('products/{productId}').onDelete((snap, context) => {
  const { images } = snap.data();
  const bucket = storage.bucket();
  const promises = [];
  images.forEach(image => {
    const path = `products/${context.params.productId}/${images.name}`;
    promises.push(bucket.file(path).delete());
  });
  return Promise.all(promises);
});

exports.deleteCatImages = functions.firestore.document('cats/{catId}').onDelete((snap, context) => {
  const { images } = snap.data();
  const bucket = storage.bucket();
  const promises = [];
  images.forEach(image => {
    const path = `cats/${context.params.catId}/${images.name}`;
    promises.push(bucket.file(path).delete());
  });
  return Promise.all(promises);
});

exports.createProduct = functions.firestore.document('products/{productId}').onCreate((snap, context) => {
  const { category, brand } = snap.data();
  const batch = fs.batch();
  batch.update(fs.collection('brands').doc(brand), {
    amount: increment(1)
  });
  batch.update(fs.collection('cats').doc(category), {
    amount: increment(1)
  });
  return batch.commit();
});

exports.deleteProduct = functions.firestore.document('products/{productId}').onDelete((snap, context) => {
  const { category, brand } = snap.data();
  const batch = fs.batch();
  batch.update(fs.collection('brands').doc(brand), {
    amount: increment(-1)
  });
  batch.update(fs.collection('cats').doc(category), {
    amount: increment(-1)
  });
  return batch.commit();
});