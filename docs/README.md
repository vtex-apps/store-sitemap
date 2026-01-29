# Sitemap

[<i class="fa-brands fa-github"></i> Source code](https://github.com/vtex-apps/store-sitemap)

The Sitemap app generates a `sitemap.xml` file for your store website, helping search engines like Google discover and index your pages more efficiently.

Once the app is installed and configured, your sitemap is automatically generated and kept up to date based on your store’s routes and settings.

## Before you begin

<Steps>

### Use Edition App 3.x or later

Sitemap is available for stores using `vtex.edition-store@3.x` or a later version of the [Edition App](https://developers.vtex.com/docs/guides/vtex-io-documentation-edition-app).

To check which Edition App is installed on your account, run `vtex edition get`. If it's an older edition, please [open a ticket](https://help-tickets.vtex.com/smartlink/sso/login/zendesk) with VTEX Support asking for the installation of the `vtex.edition-store@5.x` Edition App.

### Configure sitemap content

Adjust the products, navigation, and custom routes that will be included in the sitemap. Check the [Advanced Configuration section](#advanced-configuration) for more information.

</Steps>

## Instructions

### For all stores

1. Using your terminal and the [VTEX IO CLI](https://developers.vtex.com/docs/guides/vtex-io-documentation-vtex-io-cli-installation-and-command-reference), log in to your account.
   
2. Run `vtex use {workspaceName} --production` to use a production workspace or [create a production workspace](https://vtex.io/docs/recipes/development/creating-a-production-workspace/) from scratch.

   > ⚠️ Remember to replace the values between the curly brackets with the corresponding values of your environment.

3. Run `vtex install vtex.store-sitemap@2.x` to install the Sitemap app.

   > ℹ️ If you're using `vtex.edition-store@5.x`, skip step 3, as the `vtex.store-sitemap@2.x` app is installed by default with this version. Check our [Edition App documentation](https://developers.vtex.com/docs/guides/vtex-io-documentation-edition-app) to learn more about the different versions.

4. Choose your path:
   - **Cross-border stores**: Continue to [Cross-border setup](#cross-border-setup) below
   - **Non-cross-border stores**: Skip to [Verify your sitemap](#verify-your-sitemap)

### Cross-border setup

> ℹ️ Skip this section if your store is not cross-border. For non-cross-border stores, these steps are performed automatically when you install `vtex.store-sitemap@2.x`. 

1. Run `vtex install vtex.admin-graphql-ide@3.x` to install the GraphQL Admin IDE.

2. In your browser, access the Admin and go to **Store Setting > Storefront > GraphQL IDE**.

3. From the dropdown list, choose the `vtex.routes-bootstrap@0.x` app.

4. If this isn't the first time you're generating the store sitemap or if no changes have been made to the store routes since the last time you generated the store sitemap, go to step 5. Otherwise, run the following query:

   ```gql  
   {
     bootstrap {
       brands
       categories
     }
   }
   ```

   The expected response body is
   
   ```json
   {
     "data":{
       "bootstrap": {
         "brands": true,
         "categories": true
       }
     }
   }
   ```

5. Now, from the GraphQL IDE dropdown list, select the `vtex.store-sitemap@2.x` app.

6. Run the following query:

   ```gql
   {
     generateSitemap
   }
   ```

   The expected response body is

   ```json
   {
     "data": {
       "generateSitemap": true
     }
   }
   ```

   This means your sitemap will be available in a few minutes after it's processed and saved in our database.

   > ℹ️ The time taken to generate a sitemap is proportional to the number of products. For example, the average time to generate a sitemap for a store with 60k products is 30 minutes. For 5k products, the duration should be about 5 minutes.
   
   If you attempt to send a new request to the Sitemap API during store sitemap generation, the following message will be displayed:

   ```
   Sitemap generation already in place
   Next generation available: <End-date>
   ```
   
   To force a restart, add the `force` argument to the query, as in `generateSitemap(force: true)`. This will cancel the previous process.

### Verify your sitemap

1. Check the sitemap generated for the current workspace you're working on by accessing `https://{workspace}--{account}.myvtex.com/sitemap.xml` on your browser.

    > ℹ️ Different `.xml` files are generated based on their entity type (product, category, subcategory, user routes, brand, and department), and each `.xml` file supports a maximum of 5k routes. If you have a cross-border store, you'll first see an index with a sitemap for each locale.

2. If you're happy with the results, run `vtex promote` to promote your workspace and include your sitemap in your master workspace.

    Once you've promoted your workspace, no further action is needed on your part: You're ready to check the store sitemap by accessing `https://{account}.myvtex.com/sitemap.xml` in your browser.

### Advanced configuration

#### Managing routes

You can decide whether to include products, navigation, apps, and/or routes that contain a specific term in your sitemap. To do that,  follow the instructions below:

1. In your browser, type `{workspace}--{account}.myvtex.com/admin`, replacing the values between curly brackets with the corresponding values of your environment, to access the account's Admin of the production workspace you're working on.
   
2. Go to **Account settings > Apps > My apps** and search for **Sitemap** app.

3. Enable or disable products, navigation, apps, or routes containing a specific term for your scenario.
   
   ![sitemap-admin](https://github.com/vtexdocs/dev-portal-content/assets/112641072/649f7dcf-583d-497f-a69c-4cfc3d8a805a)

#### Enabling custom routes

If you have [custom pages](https://developers.vtex.com/vtex-developer-docs/docs/vtex-io-documentation-creating-a-new-custom-page) configured in a `routes.json` file and want them to be included in the store sitemap, add `isSitemapEntry=true` as a prop of the routes you want to include in the sitemap. Example:

   ```json
   {
       "store.custom#about-us": {
         "path": "/about-us",
         "isSitemapEntry": true
     }
   }
   ```

Once everything is set up, return to the [Instructions](#instructions) and follow the steps for your store type.

#### Extending the sitemap

To add custom routes created by an app (for example, the ones created by [`store-locator`](https://github.com/vtex-apps/store-locator)) to the store sitemap, the app must respond to an XML file containing a list of the routes created by that app. Lastly, you must include the path to the XML file that your app responds to as an index of the store sitemap.

For implementation details, check the following instructions:

1. Create or modify your app to respond to the following route `/sitemap/{index-name}.xml` and to return an XML file containing the data that you want the search engine (for example, Google) to index. Replace the values between the curly brackets according to your scenario.

   >ℹ️ We recommend using a pre-generated XML file. Otherwise, the XML file will be built from scratch for every request, which will take longer to complete.

2. [Publish](https://developers.vtex.com/vtex-developer-docs/docs/vtex-io-documentation-publishing-an-app) and install your app in a production workspace.

3. To make your index available in the sitemap root file (`/sitemap.xml`), access the account Admin of the workspace you're working on, and select the GraphQL IDE.

4. From the dropdown list, choose the `vtex.store-sitemap@2.x` app and perform the following mutation, adapting it to your scenario:

   ```gql
   mutation {
     saveIndex(index: "{index-name}")
   }
   ```

   >ℹ️ If you have a [cross-border](https://developers.vtex.com/docs/guides/vtex-io-cross-border-stores) store, the `saveIndex` mutation also accepts the `binding` ID as an argument, which means that by specifying the `binding` ID, you can add your new index to the sitemap of the desired binding. If the `binding` ID is not specified, the mutation will consider the default binding of the store.

5. Check the updated sitemap for the current workspace you're working on by accessing `https://{workspace}--{account}.myvtex.com/sitemap.xml` in your browser.

6. If you're happy with the results, run `vtex promote` to promote your workspace and include the sitemap in your master workspace.

#### Removing a custom route

If you ever want to remove a custom route, you can execute the following mutation, which takes the same arguments as `saveIndex`:

   ```gql
   mutation {
      deleteIndex(index: "{index-name}")
   }
   ```

### Fetching custom routes in JSON format

The `vtex.store-sitemap` app exposes an API endpoint that allows you to retrieve route data in JSON format. This endpoint is useful for external sitemap generation or custom indexing workflows.

The endpoint returns a combination of routes defined via CMS and internal pages, and routes defined by installed apps in their `build.json` files.

> ⚠️ Product, brand, and category routes are not included.

| Method | Endpoint                          |
|--------|-----------------------------------|
| `GET`  | `/_v/public/sitemap/custom-routes` |

**Example request:**

```
GET https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes
**Example response:**

>ℹ️ Custom route generation is subject to internal limits. If you notice missing routes in the response, please contact [VTEX Support](https://supporticket.vtex.com/support).

```json
[
{
"name": "apps-routes",
"routes": ["/store-locator/ny", "/store-locator/ca"]
},
{
"name": "user-routes",
"routes": ["/about-us", "/contact", "/faq"]
}
]
