const express = require("express");
const multer = require("multer");
const app = express();
const PORT = process.env.PORT || 8000;
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
const e = require("express");
let courses = [
  {
    id: 1,
    name: "Introduce c",
  },
  {
    id: 2,
    name: "Introduce java",
  },
];

// Thiết lập view engine là 'ejs'
app.set("view engine", "ejs");

// Thiết lập thư mục chứa các view là 'templates'
app.set("views", "./templates");

// Sử dụng middleware để cung cấp các tệp tĩnh trong thư mục 'templates'
app.use(express.static("./templates"));

app.use(express.urlencoded());

// Config AWS
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";
// Config aws sdk access cloud aws for account IAM
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3(); // Create a new instance of S3
const dynamodb = new AWS.DynamoDB.DocumentClient(); // Create a new instance of DynamoDB

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

const storage = multer.memoryStorage({
  destination(req, file, cb) {
    cb(null, "");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2000000 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

// check file is image
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb("Error: Images Only!");
  }
}

// Get list san pham from dynamodb
app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    // console.log("Data from dynamodb", data.Items);
    return res.render("index.ejs", { courses: data.Items });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Post data from client
app.post("/save", upload.single("image"), (req, res) => {
  try {
    console.log(req.body);
    const maSanPham = req.body.maSP;
    const tenSP = req.body.tenSP;
    const soLuong = Number(req.body.soLuong);
    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1]; // lay duoi file anh
    const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;
    const paramsS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.log("error is", err);
        return res.status(500).json({ message: "Internal Server" });
      } else {
        const imageURL = data.Location; // assign url image to imageURL
        const paramsDynamoDB = {
          TableName: tableName,
          Item: {
            maSP: maSanPham,
            tenSP: tenSP,
            soLuong: Number(soLuong),
            image: imageURL,
          },
        };
        await dynamodb.put(paramsDynamoDB).promise();
        return res.redirect("/");
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server" });
  }
});

app.post("/delete", upload.none(), async (req, res) => {
  const { ids } = req.body;

  try {
    if (Array.isArray(ids).length === 0 || !ids) {
      return res.redirect("/");
    }
    await Promise.all(
      (Array.isArray(ids) ? ids : [ids]).map((id) =>
        dynamodb
          .delete({
            TableName: tableName,
            Key: {
              maSP: id,
            },
          })
          .promise()
      )
    );

    res.redirect("/");
  } catch (error) {
    console.error("Error deleting items:", error);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`server is running with port ${PORT}`);
});
