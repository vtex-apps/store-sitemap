# Sitemap

The Sitemap app allows you to generate a `sitemap.xml` file for your store website. After deploying and installing the app on your account, you can create a sitemap to improve store visibility on search engines such as Google. 

To learn how to generate a sitemap, follow the instructions below.

## Before you begin

- This app is available for stores using `vtex.edition-store@3.x` or a later version of the [Edition App](https://developers.vtex.com/docs/guides/vtex-io-documentation-edition-app).
   To check which Edition App is installed on your account, run `vtex edition get`. If it's an older edition, please [open a ticket](https://help-tickets.vtex.com/smartlink/sso/login/zendesk) with VTEX Support asking for the installation of the `vtex.edition-store@5.x` Edition App.

- Adjust the products, navigation, and custom routes that will be included in the sitemap. Check the [Advanced Configuration section](#advanced-configuration) for more information.

## Instructions

1. Using your terminal and the [VTEX IO CLI](https://vtex.io/docs/recipes/development/vtex-io-cli-installation-and-command-reference/), log in to your account.
   
2. Run `vtex use {workspaceName} --production` to use a production workspace or [create a production workspace](https://vtex.io/docs/recipes/development/creating-a-production-workspace/) from scratch.

   >⚠️ Remember to replace the values between the curly brackets with the corresponding values of your environment.

3. Run `vtex install vtex.store-sitemap@2.x` to install the Sitemap app.

   > ℹ️ If you're using `vtex.edition-store@5.x`, skip step 3, as the `vtex.store-sitemap@2.x` app is installed by default with this version. Check our [Edition App documentation](https://developers.vtex.com/docs/guides/vtex-io-documentation-edition-app) to learn more about the different versions.

4. Run `vtex install vtex.admin-graphql-ide@3.x` to install the GraphQL admin IDE.
   
5. In your browser, access the Admin and go to **Store Setting > Storefront > GraphQL IDE**.

6. From the dropdown list, choose the `vtex.routes-bootstrap@0.x` app.

7. If this isn't the first time you're generating the store sitemap or if no changes have been made to the store routes since the last time you generated the store sitemap, go to step 8. Otherwise, run the following query:

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

8. Now, from the GraphQL IDE dropdown list, select the `vtex.store-sitemap@2.x` app.

9. Run the following query:

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

   This means your sitemap will be available in some minutes, after being processed and saved on our database.

   >ℹ️ The time taken to generate a sitemap is proportional to the number of products. For example, the average time to generate a sitemap for a store with 60k products is 30 minutes. For 5k products, the duration should be about 5 minutes.
   
   If you attempt to send a new request to the Sitemap API during store sitemap generation, the following message will be displayed:

   ```
   Sitemap generation already in place
   Next generation available: <End-date>
   ```
   
   To force a restart, add the `force` argument to the query, as in `generateSitemap(force: true)`. This will cancel the previous process.

10. Check the sitemap generated for the current workspace you're working on by accessing `https://{workspace}--{account}.myvtex.com/sitemap.xml` on your browser. Keep in mind that if you  have a cross-border store, you’ll first see an index with a sitemap for each locale.

    >ℹ️ Different `.xml` files are generated based on their entity type (product, category, subcategory, user routes, brand, and department), and each `.xml` file supports a maximum of 5k routes.

11. If you're happy with the results, run `vtex promote` to promote your workspace and include your sitemap in your master workspace.

    Once you’ve promoted your workspace, no further actions are needed on your part: you’re ready to check  the store sitemap by accessing `https://{account}.myvtex.com/sitemap.xml` on your browser.

### Advanced configuration

#### Managing routes

You can manage whether to include products, navigation, apps, and/or routes containing a specific term in your sitemap. To do that,  follow the instructions below:

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

Once everything is set up, go back to **step 4** of the [Instructions](#instructions).

#### Extending the sitemap

To add custom routes created by an app (for example, the ones created by [`store-locator`](https://github.com/vtex-apps/store-locator)) to the store sitemap, the app must respond to an XML file containing a list of the routes created by that app. Lastly, you must include the path to the XML file that your app responds to as an index of the store sitemap.

For implementation details, check the following instructions:

1. Create or modify your app to respond to the following route `/sitemap/{index-name}.xml` and to return an XML file containing the data that you want the search engine (for example, Google) to index. Replace the values between the curly brackets according to your scenario.

   >ℹ️ We recommend using a pre-generated XML file. Otherwise, the XML file will be built from scratch for every request, consuming more time to complete the task.

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
