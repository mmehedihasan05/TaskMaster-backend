import Express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const app = Express();
const port = process.env.PORT || 5000;
app.use(
    cors({
        origin: [
            "http://localhost:5100",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "https://taskmaster-6dafb.firebaseapp.com",
            "https://taskmaster-6dafb.web.app",
        ], // The domains where the client side will run

        credentials: true, // This will help to set cookies
    })
);

app.use(Express.json());
app.use(cookieParser());

/*

*/

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.cx7zh4x.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

function extractuserEmail(req, method) {
    if (method === "GET" || method === "DELETE") {
        return req.query.email || "";
    } else if (method === "POST" || method === "PUT" || method === "PATCH") {
        return req.body.email || "";
    } else {
        return "";
    }
}

function extractuserId(req, method) {
    if (method === "GET" || method === "DELETE") {
        return req.query.userId || "";
    } else if (method === "POST" || method === "PUT" || method === "PATCH") {
        return req.body.userId || "";
    } else {
        return "";
    }
}

// middlewares
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: "unauthorized" });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        //    error
        if (err) {
            console.log(err);
            return res.status(401).send({ message: "unauthorized" });
        }

        req.user = decoded;

        // if its valid it will be decoded
        next();
    });
};

const requestValidate = async (req, res, next) => {
    const method = req.method;

    let decoded_Email = req.user?.userEmail;
    let decoded_UserId = req.user?.userId;

    const userEmail = extractuserEmail(req, method);

    const userId = extractuserId(req, method);

    const requestedUrl = req.originalUrl;
    // console.log({
    //     method,
    //     requestedUrl,
    //     decoded: { decoded_Email, decoded_UserId },
    //     url: { userEmail, userId },
    // });

    if (decoded_Email !== userEmail && decoded_UserId !== userId) {
        return res.status(401).send({ message: "unauthorized" });
    }

    // console.log(200, "Authorized successfully.");
    next();
};

async function mainProcess() {
    try {
        // await client.connect();
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const tasks = client.db("taskmaster").collection("tasks");

        // Authenticating
        app.post("/authenticate", async (req, res) => {
            const userEmail = req.body.email;
            const userId = req.body.userId;

            // console.log("from authenticate body email ", { userEmail, userId });

            const token = jwt.sign({ userEmail, userId }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: "24h",
            });

            // For localhost
            const cookieOptionsLocal = {
                httpOnly: true, // jehetu localhost tai http only
                secure: false, // localhost tai secure false
                sameSite: false, // localhost and server er port different tai none
            };

            // const cookieOptionsProd = {
            //     httpOnly: true,
            //     secure: true,
            //     sameSite: "none",
            //     maxAge: 24 * 60 * 60 * 1000,
            // };
            // production
            const cookieOptionsProd = {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            };

            res.cookie("token", token, cookieOptionsProd);

            res.send({ success: true });
        });

        // Logout
        app.post("/logout", async (req, res) => {
            // res.clearCookie("token", { maxAge: 0 });
            res.clearCookie("token", {
                maxAge: 0,
                secure: process.env.NODE_ENV === "production" ? true : false,
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            });

            res.send({ success: true });
        });

        // all blog Data Fetch
        // open api
        // sort and return
        app.get("/allblogs", async (req, res) => {
            // For testing purpose
            console.log("All blogs requested");

            // Search Data Collecting
            const searchTitle = req.query.searchTitle;
            let searchCategories = req.query.categories;
            let sort_Date = req.query.sort_Date || "descending";

            const sortTimeOrder =
                sort_Date === "descending" ? -1 : sort_Date === "ascending" ? 1 : -1;

            let allBlogsList = [];
            let searchedBlogs = true;

            if (!searchTitle && !searchCategories) {
                // Return all data.
                const query = {};

                const cursor = allBlogs.find(query);
                cursor.sort({ creationTime: sortTimeOrder });
                allBlogsList = await cursor.toArray();
                searchedBlogs = false;
            } else {
                // return search data
                let query = {};
                const options = {
                    sort: {
                        creationTime: sortTimeOrder,
                    },
                };

                if (searchTitle) {
                    query.title = { $regex: searchTitle, $options: "i" };
                }

                if (searchCategories) {
                    query.category = { $in: searchCategories.split(",") };
                }

                allBlogsList = await allBlogs.find(query, options).toArray();
            }

            // if user logged in there must be a token and it has been verified previously
            // But if the user is not logged in, there will be no token and no data in req.user
            // so the user id will be available in req.user and its simple to fetch wishlist data using that user id.
            if (req.user) {
                const userId = req.user.userId;
                const wishlistQuery = { userId: userId };
                const wishListData = await wishlist.findOne(wishlistQuery);

                // No wishlist data available for that user, thats why its null
                if (!wishListData) {
                    // console.log("No wishlist data available");
                    return res.send({ searchedBlogs, allBlogs: allBlogsList });
                    // return res.send(allBlogsList);
                } else {
                    const wishLists = wishListData.wishLists;
                    // console.log("wishLists", wishLists);

                    // Now wishlists data will merge with the blogs data
                    let updatedAllBlogsList = [];

                    allBlogsList.forEach((blogData) => {
                        wishLists.forEach((wishlistBlogId) => {
                            if (blogData._id.equals(wishlistBlogId)) {
                                blogData.wishlist = true;
                            }
                        });

                        if (!blogData.wishlist) {
                            blogData.wishlist = false;
                        }

                        updatedAllBlogsList.push(blogData);
                    });

                    return res.send({ searchedBlogs, allBlogs: updatedAllBlogsList });
                }
            } else {
                return res.send({ searchedBlogs, allBlogs: allBlogsList });
            }
        });

        // Post blog to db
        // Protected Api
        app.post("/create-task", async (req, res) => {
            const taskInfo = req.body;

            console.log(taskInfo);

            const result = await tasks.insertOne(taskInfo);

            console.log(result);
            res.send(result);
        });

        // Update blog
        // Protected Api
        app.put("/updateBlog/:blog_id", verifyToken, requestValidate, async (req, res) => {
            const blog_id = req.params.blog_id;
            const blogData = req.body.blogData;

            const query = { _id: new ObjectId(blog_id) };
            const options = { upsert: false };

            const updatedData = {
                $set: {
                    bannerUrl: blogData.bannerUrl,
                    title: blogData.title,
                    category: blogData.category,
                    shortDescription: blogData.shortDescription,
                    longDescription: blogData.longDescription,
                },
            };

            const result = await allBlogs.updateOne(query, updatedData, options);

            res.send(result);
        });
    } finally {
        // await client.close();
    }
}

// Started mainProcess() function
mainProcess().catch(console.dir);

app.get("/", (req, res) => {
    res.send("TaskMaster Server Running");
});

app.listen(port, () => {
    console.log(`Running on port http://localhost:${port}
------------------------------------`);
});
