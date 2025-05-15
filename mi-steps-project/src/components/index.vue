<template>
  <div class="container">
    <!-- 头部保持不变 -->
    <div class="form-container">
      <el-tag type="danger" effect="dark" class="warning-tag">
        仅供学习交流，严禁用于商业用途!
      </el-tag>
      <div class="input-group">
        <el-input
          v-for="(item, index) in inputConfig"
          :key="index"
          v-model="form[item.prop]"
          :placeholder="item.placeholder"
          :type="item.type || 'text'"
          :maxlength="item.maxlength"
          :show-password="item.showPassword"
        >
          <template slot="prepend">{{ item.label }}</template>
        </el-input>
      </div>
      <div class="btn">
        <el-button type="primary" :loading="isLoading" @click="handleSubmit">
          {{ isLoading ? "提交中..." : "立即提交" }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      form: {
        // 将分散的字段整合为表单对象
        phone: "",
        password: "",
        steps: "",
      },
      isLoading: false, // 添加加载状态
      inputConfig: [
        {
          label: "账号",
          prop: "phone",
          placeholder: "请输入小米运动注册时的邮箱或手机号",
          type: "tel",
        },
        {
          label: "密码",
          prop: "password",
          placeholder: "请输入小米运动注册时的密码",
          type: "password",
          showPassword: true,
        },
        {
          label: "步数",
          prop: "steps",
          placeholder: "请输入小于99999步数",
          type: "number",
          maxlength: 5,
        },
      ],
    };
  },
  methods: {
    validateForm() {
      const { phone, password, steps } = this.form;
      const errors = [];

      if (!phone || !password || !steps) {
        errors.push("请填写所有必填项");
      }

      if (steps > 99999 || steps < 0) {
        errors.push("步数应在0-99999之间");
      }

      return errors;
    },

    async handleSubmit() {
      const errors = this.validateForm();
      if (errors.length > 0) {
        this.$message.error(errors.join("，"));
        return;
      }

      try {
        this.isLoading = true;
        const ticket = localStorage.getItem("ticket");
        const { data } = await axios.post("/run", {
          phoneNumber: this.form.phone.trim(),
          password: this.form.password.trim(),
          steps: this.form.steps.trim(),
          ticket,
        });

        const messageType = data.code === "200" ? "success" : "error";
        this.$message[messageType]({
          showClose: true,
          message: data[messageType === "success" ? "success" : "err"],
          center: true,
        });
        data.ticket && localStorage.setItem("ticket", data.ticket);
      } catch (error) {
        this.$message.error(`请求失败: ${error.message}`);
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}
.form-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.warning-tag {
  width: 95%;
  height: 50px;
  font-size: 16px;
  margin: 15px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-group {
  width: 100%;
  margin: 10px 0;
}

.el-input {
  width: 95%;
  margin: 10px auto;
}

.el-input >>> .el-input-group__prepend {
  width: 80px;
  text-align: center;
}

.el-button {
  width: 200px;
  height: 40px;
  margin-top: 20px;
  font-size: 16px;
}

.el-divider {
  margin: 30px 0;
}

@media (max-width: 768px) {
  .container {
    padding: 10px;
  }

  .el-input {
    width: 100%;
  }
}
</style>
